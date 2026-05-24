import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { type McpTool } from './mcpSdk';
import { stringJoin } from './server.helpers';
import { assertInput, assertInputStringLength, assertInputStringNumberEnumLike } from './server.assertions';
import { getOptions } from './options.context';
import { searchPatternFly } from './patternFly.search';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { paramCompletion } from './resource.helpers';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';

/**
 * searchPatternFly tool function
 *
 * Searches for PatternFly resources using fuzzy search.
 * Returns MCP Resource Links when contextManagement: 'token-saver' is active.
 *
 * @param options - Optional configuration options (defaults to OPTIONS)
 * @returns MCP tool tuple [name, schema, callback]
 */
const searchPatternFlyTool = (options = getOptions()): McpTool => {
  const callback = async (args: any) => {
    const { searchQuery, version } = args;
    const isVersion = typeof version === 'string' && version.length > 0;

    assertInputStringLength(searchQuery, {
      ...options.minMax.inputStrings,
      inputDisplayName: 'searchQuery'
    });

    if (isVersion) {
      assertInputStringLength(version, {
        max: options.minMax.inputStrings.max,
        min: 2,
        inputDisplayName: 'version'
      });

      assertInputStringNumberEnumLike(version, options.patternflyOptions.availableSearchVersions, {
        inputDisplayName: 'version'
      });
    }

    const { latestVersion } = await getPatternFlyMcpResources.memo();
    const normalizedVersion = await normalizeEnumeratedPatternFlyVersion(version);
    const updatedVersion = normalizedVersion || latestVersion;

    const { isSearchWildCardAll, exactMatches, remainingMatches, searchResults, totalPotentialMatches } = await searchPatternFly.memo(
      searchQuery,
      { version: updatedVersion },
      { allowWildCardAll: true, maxResults: options.minMax.resourceSearches.max }
    );

    assertInput(
      !isSearchWildCardAll || (isSearchWildCardAll && searchResults.length > 0),
      stringJoin.newline(
        `Internal Search Error: The server failed to retrieve PatternFly resources for query "${searchQuery}"`,
        'Ensure documentation resources are loaded or restart the server.'
      ),
      ErrorCode.InternalError
    );

    if (!isSearchWildCardAll && searchResults.length === 0) {
      const suggestions = await paramCompletion.memo({ version: updatedVersion });

      return {
        content: [{
          type: 'text',
          text: stringJoin.newlineFiltered(
            `No PatternFly resources found matching "${searchQuery}"`,
            options.separator,
            '**Important**:',
            '  - Use a search all ("*") to find all available resources.',
            suggestions.sections.length ? `  - Some available sections are: ${suggestions.sections.slice(0, 3).join(', ')}` : undefined,
            suggestions.categories.length ? `  - Some available categories are: ${suggestions.categories.slice(0, 3).join(', ')}` : undefined
          )
        }]
      };
    }

    // Default to parsing all remainingMatches
    let parseResults = remainingMatches;

    // Focus the result set. If there are exact matches, use those.
    if (isSearchWildCardAll || exactMatches.length > 0) {
      parseResults = exactMatches;

    // Focus the result set. If there aren't any exactMatches use "distance 1" matches only.
    } else if (searchResults.some(result => result.distance === 1)) {
      parseResults = searchResults.filter(result => result.distance === 1);
    }

    const searchTitlePatternFly = updatedVersion
      ? `Search results for PatternFly version "${updatedVersion}" and`
      : `Search results for`;

    let searchTitle = stringJoin.basic(
      `# ${searchTitlePatternFly} "${searchQuery}".`,
      `Showing ${parseResults.length} related ${parseResults.length === 1 ? 'match' : 'matches'}.`
    );

    if (isSearchWildCardAll) {
      searchTitle = stringJoin.basic(
        `# ${searchTitlePatternFly} "all" resources.`,
        `Only showing the first ${parseResults.length} results. There are ${totalPotentialMatches} potential match variations.`,
        `Try searching with a more specific query.`
      );
    } else if (exactMatches.length > 0) {
      searchTitle = stringJoin.basic(
        `# ${searchTitlePatternFly} "${searchQuery}".`,
        `Showing ${parseResults.length} exact ${parseResults.length === 1 ? 'match' : 'matches'}.`
      );
    }

    const results = parseResults.map(result => result.entries
      .filter(entry => entry.path)
      .map(entry => {
        const resource = [];

        if (entry.uriFull) {
          resource.push({
            type: 'resource_link',
            uri: entry.uriFull,
            name: `${entry.displayName} - (${entry.version})`,
            description: entry.description,
            mimeType: 'text/markdown'
          });
        }

        if (entry.uriSchemasFull) {
          resource.push({
            type: 'resource_link',
            uri: entry.uriSchemasFull,
            name: `${entry.displayName} JSON Schemas - (${entry.version})`,
            description: `${entry.displayName} JSON schemas.`,
            mimeType: 'application/json'
          });
        }

        return resource;
      }).flat(2));

    return {
      content: [
        {
          type: 'text',
          text: stringJoin.newline(
            searchTitle,
            '**Important**:',
            '  - Use the attached resources to access and read full content.',
            '  - Use a search all ("*") to find all available resources.'
          )
        },
        ...results
      ]
    };
  };

  return [
    'searchPatternFly',
    {
      description: `Find PatternFly resources and get component names with documentation resources. Supports case-insensitive partial and all ("*") matches.

      **Usage**:
        1. Input a "searchQuery" to find and return PatternFly documentation, guideline, and component JSON schemas.

      **Returns**:
        - Component, documentation, and guideline resource links that can be used to access and read full content.
      `,
      inputSchema: {
        searchQuery: z.string()
          .min(options.minMax.inputStrings.min)
          .max(options.minMax.inputStrings.max)
          .describe('Full or partial resource or component name to search for (e.g., "button", "react", "*")'),
        version: z.enum(options.patternflyOptions.availableSearchVersions)
          .optional()
          .describe(`Filter results by a specific PatternFly version (e.g. ${options.patternflyOptions.availableSearchVersions.map(value => `"${value}"`).join(', ')})`)
      }
    },
    callback,
    {
      shouldRegister: opts => opts.contextManagement === 'token-saver'
    }
  ];
};

searchPatternFlyTool.toolName = 'searchPatternFly';

export { searchPatternFlyTool };
