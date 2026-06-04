import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { type McpTool } from './mcpSdk';
import { stringJoin } from './server.helpers';
import { assertInput, assertInputStringLength, assertInputStringNumberEnumLike } from './server.assertions';
import { getOptions } from './options.context';
import { searchPatternFlyContext } from './patternFly.searchContext';
import { getPatternFlyContextManagementResources } from './patternFly.getResourcesContext';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { findClosest } from './server.search';

/**
 * searchPatternFly tool function
 *
 * Searches for PatternFly resources using the optimized context management system.
 * Returns MCP Resource Links for both specific documents and collection hubs.
 *
 * @note Review moving JSON schemas to having their own record IDs.
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

    // Get resources from the new context engine
    const { latestVersion, idIndex, nameIndex } = await getPatternFlyContextManagementResources.memo();
    const normalizedVersion = await normalizeEnumeratedPatternFlyVersion(version);
    const updatedVersion = normalizedVersion || latestVersion;

    const query = String(searchQuery).trim();
    const isWildCardAll = query === '*' || query.toLowerCase() === 'all' || query === '';
    const allowWildCardAll = true;
    const isSearchWildCardAll = allowWildCardAll && isWildCardAll;

    // Execute search using the optimized context search function
    const { exactMatches, remainingMatches, searchResults } = await searchPatternFlyContext.memo(
      query,
      { version: updatedVersion },
      { allowWildCardAll, dynamicFilter: true, maxResults: options.minMax.resourceSearches.max }
    );

    assertInput(
      !isSearchWildCardAll || (isSearchWildCardAll && searchResults.length > 0),
      stringJoin.newline(
        `Internal Search Error: The server failed to retrieve PatternFly resources for query "${searchQuery}"`,
        'Ensure documentation resources are loaded or restart the server.'
      ),
      ErrorCode.InternalError
    );

    // Provide helpful suggestions if no results are found
    if (!isSearchWildCardAll && searchResults.length === 0) {
      const suggestionList = Array.from(nameIndex.keys()).reverse();
      const suggestion = findClosest.memo(query, suggestionList, { maxDistance: 5 });
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

    // Prioritize results: exact/wildcard matches > distance 1 matches > remaining
    let parseResults = remainingMatches;

    if (isSearchWildCardAll || exactMatches.length > 0) {
      parseResults = exactMatches;
    } else if (searchResults.some(result => result.distance === 1)) {
      parseResults = searchResults.filter(result => result.distance === 1);
    }

    const results = new Map<string, Record<string, unknown>>();

    parseResults.forEach(result => {
      const { record, uri } = result;

      if (results.has(uri)) {
        return;
      }

      // 1. Handle Collection Hubs
      if (record.recordType === 'collection') {
        results.set(uri, {
          type: 'resource_link',
          uri,
          name: `${record.displayName} (Collection)`,
          description: record.description,
          mimeType: 'text/markdown'
        });

        return;
      }

      // 2. Handle Individual Records
      results.set(uri, {
        type: 'resource_link',
        uri,
        name: `${record.displayName} - ${record.displayCategory} (${record.version})`,
        description: record.description,
        mimeType: 'text/markdown'
      });
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
        `Only showing ${resultValues.length} ${basePluralResource} out of ${idIndex.size} potential matches. Use a more specific query.`
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
