import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { type McpTool } from './mcpSdk';
import { stringJoin } from './server.helpers';
import { assertInput, assertInputStringLength, assertInputStringNumberEnumLike } from './server.assertions';
import { getOptions } from './options.context';
import { searchPatternFly } from './patternFly.search';
import { getPatternFlyMcpResources } from './patternFly.getResources';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { findClosest } from './server.search';

/**
 * searchPatternFly tool function
 *
 * Searches for PatternFly resources using fuzzy search.
 * Returns MCP Resource Links when contextManagement: 'token-saver' is active.
 *
 * @note Review not filtering out resources without a path. These resources could be
 * inlined or handled with the upcoming on-demand session resource loader.
 *
 * @param options - Optional configuration options (defaults to OPTIONS)
 * @returns MCP tool tuple [name, schema, callback]
 */
const searchPatternFlyTool = (options = getOptions()): McpTool => {
  const callback = async (args: any) => {
    const { query: searchQuery, version } = args;
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

    const { latestVersion, keywordsIndex } = await getPatternFlyMcpResources.memo();
    const normalizedVersion = await normalizeEnumeratedPatternFlyVersion(version);
    const updatedVersion = normalizedVersion || latestVersion;

    const { isSearchWildCardAll, exactMatches, remainingMatches, searchResults, totalPotentialMatches } = await searchPatternFly.memo(
      searchQuery,
      { version: updatedVersion },
      { allowWildCardAll: true, dynamicFilter: true, maxResults: options.minMax.resourceSearches.max }
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
      const suggestion = findClosest.memo(searchQuery, keywordsIndex.reverse(), { maxDistance: 5 });
      const hint = suggestion ? `Try a search for "${suggestion}".` : `Try a broader search.`;

      return {
        content: [{
          type: 'text',
          text: stringJoin.newlineFiltered(
            `No PatternFly resources found matching "${searchQuery}". ${hint}`
          )
        }]
      };
    }

    // Default to parsing all remainingMatches
    let parseResults = remainingMatches;

    // Focus the result set. If there are exact matches, use those.
    if (isSearchWildCardAll || exactMatches.length > 0) {
      parseResults = exactMatches;

    // Focus the result set. If there aren't any exactMatches, but we have "distance 1" matches, use those.
    } else if (searchResults.some(result => result.distance === 1)) {
      parseResults = searchResults.filter(result => result.distance === 1);
    }

    const results = new Map<string, Record<string, unknown>>();

    parseResults
      .map(result => result.entries)
      .flat()
      .filter(entry => entry.path)
      .forEach(entry => {
        if (entry.uriId && !entry.uriComponentId && !results.has(entry.uriId)) {
          results.set(entry.uriId, {
            type: 'resource_link',
            uri: entry.uriId,
            name: `${entry.displayName} - ${entry.displayCategory} (${entry.version})`,
            description: entry.description,
            mimeType: 'text/markdown'
          });
        }

        if (entry.uriComponentId && !results.has(entry.uriComponentId)) {
          let updatedName = `${entry.displayName} - Technical Overview`;
          let updatedDesc = `Component API reference for ${entry.displayName}.`;

          if (entry.isSchemasAvailable) {
            updatedName = `${entry.displayName} - Technical Specs`;
            updatedDesc = `Component API reference, property definitions, and JSON schema for ${entry.displayName}.`;
          }

          results.set(entry.uriComponentId, {
            type: 'resource_link',
            uri: entry.uriComponentId,
            name: `${updatedName} (${entry.version})`,
            description: updatedDesc,
            mimeType: 'text/markdown'
          });
        }
      });

    const resultValues = Array.from(results.values());

    const summaryTitlePatternFly = updatedVersion
      ? `Search results for PatternFly version "${updatedVersion}" and`
      : `Search results for`;

    const basePluralResource = resultValues.length === 1 ? 'resource' : 'resources';

    const baseSummaryTitle = stringJoin.filtered(
      `Found ${resultValues.length} related ${basePluralResource}.`,
      resultValues.length ? `Use the attached ${basePluralResource} to access and read full content.` : ''
    );

    let summaryTitle = stringJoin.newline(
      `# ${summaryTitlePatternFly} "${searchQuery}".`,
      baseSummaryTitle
    );

    if (isSearchWildCardAll) {
      summaryTitle = stringJoin.newline(
        `# ${summaryTitlePatternFly} "all" resources.`,
        `Only showing ${resultValues.length} ${basePluralResource} out of ${totalPotentialMatches} potential matches. Use a more specific query.`
      );
    } else if (exactMatches.length > 0) {
      summaryTitle = stringJoin.newline(
        `# ${summaryTitlePatternFly} "${searchQuery}".`,
        `Found ${resultValues.length} exact ${basePluralResource}. Use the attached ${basePluralResource} to access and read full content.`
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: summaryTitle
        },
        ...resultValues
      ]
    };
  };

  return [
    'searchPatternFly',
    {
      description: `Search PatternFly components, documentation, guidelines, and resource links by keywords or '*' for all.`,
      inputSchema: {
        query: z.string()
          .min(options.minMax.inputStrings.min)
          .max(options.minMax.inputStrings.max)
          .describe('Case-insensitive, full or partial keyword query (e.g., "button", "react", "*")'),
        version: z.enum(options.patternflyOptions.availableSearchVersions)
          .optional()
          .describe(`Filter results by a specific PatternFly version (e.g. ${options.patternflyOptions.availableSearchVersions.map(value => `"${value}"`).join(', ')})`)
      }
    },
    callback,
    {
      shouldRegister: opts => opts.contextManagement === true
    }
  ];
};

searchPatternFlyTool.toolName = 'searchPatternFly';

export { searchPatternFlyTool };
