import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpTool } from './server';
import { fuzzySearch, type FuzzySearchResult } from './server.search';
import { getOptions } from './options.context';
import { memo } from './server.caching';
import { stringJoin } from './server.helpers';
import { DEFAULT_OPTIONS } from './options.defaults';
import {
  getPatternFlyMcpDocs,
  // getPatternFlyMcpResources,
  getPatternFlyReactComponentNames
} from './patternFly.getResources';

/**
 * Search for PatternFly component documentation URLs using fuzzy search.
 *
 * @param searchQuery - Search query string
 * @param settings - Optional settings object
 * @param settings.components - Object of multifaceted component names to search.
 * @param settings.documentation - Object of multifaceted documentation entries to search.
 * @param settings.allowWildCardAll - Allow a search query to match all components. Defaults to false.
 * @returns Object containing search results and matched URLs
 *   - `isSearchWildCardAll`: Whether the search query matched all components
 *   - `firstExactMatch`: First exact match within fuzzy search results
 *   - `exactMatches`: All exact matches within fuzzy search results
 *   - `searchResults`: Fuzzy search results
 */
const searchPatternFly = (searchQuery: string, {
  components = getPatternFlyReactComponentNames.memo(),
  documentation = getPatternFlyMcpDocs.memo(),
  // resources = getPatternFlyMcpResources.memo(),
  allowWildCardAll = false
} = {}) => {
  const isWildCardAll = searchQuery.trim() === '*' || searchQuery.trim().toLowerCase() === 'all' || searchQuery.trim() === '';
  const isSearchWildCardAll = allowWildCardAll && isWildCardAll;
  let searchResults: FuzzySearchResult[] = [];

  if (isSearchWildCardAll) {
    searchResults = components.allComponentNames.map(name => ({ matchType: 'all', distance: 0, item: name } as FuzzySearchResult));
  } else {
    searchResults = fuzzySearch(searchQuery, components.allComponentNames, {
      maxDistance: 3,
      maxResults: 10,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    });
  }

  const extendResults = (results: FuzzySearchResult[] = []) => results.map(result => {
    const isSchemasAvailable = components.componentNamesWithSchema.includes(result.item);
    const urls = documentation.byNameWithPath[result.item] || [];
    const matchedUrls = new Set<string>();

    urls.forEach(url => {
      matchedUrls.add(url);
    });

    return {
      ...result,
      doc: `patternfly://docs/${result.item}`,
      isSchemasAvailable,
      schema: isSchemasAvailable ? `patternfly://schemas/${result.item}` : undefined,
      urls: Array.from(matchedUrls)
    };
  });

  const exactMatches = searchResults.filter(result => result.matchType === 'exact');
  const extendedExactMatches = extendResults(exactMatches);
  const extendedSearchResults = extendResults(searchResults);

  return {
    isSearchWildCardAll,
    firstExactMatch: extendedExactMatches[0],
    exactMatches: extendedExactMatches,
    searchResults: extendedSearchResults
  };
};

/**
 * Memoized version of searchComponents.
 */
searchPatternFly.memo = memo(searchPatternFly, DEFAULT_OPTIONS.toolMemoOptions.searchPatternFlyDocs);

/**
 * searchPatternFlyDocs tool function
 *
 * Searches for PatternFly component documentation URLs using fuzzy search.
 * Returns URLs only (does not fetch content). Use usePatternFlyDocs to fetch the actual content.
 *
 * @param options - Optional configuration options (defaults to OPTIONS)
 * @returns MCP tool tuple [name, schema, callback]
 */
const searchPatternFlyDocsTool = (options = getOptions()): McpTool => {
  const callback = async (args: any = {}) => {
    const { searchQuery } = args;

    if (typeof searchQuery !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: searchQuery must be a string: ${searchQuery}`
      );
    }

    if (searchQuery.length > options.maxSearchLength) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Search query exceeds ${options.maxSearchLength} character max length.`
      );
    }

    const { isSearchWildCardAll, searchResults } = searchPatternFly.memo(searchQuery, { allowWildCardAll: true });

    if (!isSearchWildCardAll && searchResults.length === 0) {
      return {
        content: [{
          type: 'text',
          text: stringJoin.newline(
            `No PatternFly documentation found matching "${searchQuery}"`,
            '',
            '---',
            '',
            '**Important**:',
            '  - Use a search all ("*") to find all available components.'
          )
        }]
      };
    }

    const results = searchResults.map(result => {
      const urlList = result.urls.map((url: string, index: number) => `  ${index + 1}. ${url}`).join('\n');

      return stringJoin.newline(
        '',
        `## ${result.item}`,
        `**Match Type**: ${result.matchType}`,
        `### "usePatternFlyDocs" tool documentation URLs`,
        urlList.length ? urlList : '  - No URLs found',
        `### Resources metadata`,
        ` - **Component name**: ${result.item}`,
        ` - **JSON Schemas**: ${result.isSchemasAvailable ? 'Available' : 'Not available'}`
      );
    });

    return {
      content: [{
        type: 'text',
        text: stringJoin.newline(
          `# Search results for "${isSearchWildCardAll ? 'all components' : searchQuery}", ${searchResults.length} matches found:`,
          ...results,
          '',
          '---',
          '',
          '**Important**:',
          '  - Use the "usePatternFlyDocs" tool with the above URLs to fetch documentation content.',
          '  - Use a search all ("*") to find all available components.'
        )
      }]
    };
  };

  return [
    'searchPatternFlyDocs',
    {
      description: `Search PatternFly components and get component names with documentation URLs. Supports case-insensitive partial and all ("*") matches.

      **Usage**:
        1. Input a "searchQuery" to find PatternFly documentation URLs and component names.
        2. Use the returned component names OR URLs with the "usePatternFlyDocs" tool to get markdown documentation and component JSON schemas.

      **Returns**:
        - Component names that can be used with "usePatternFlyDocs"
        - Documentation URLs that can be used with "usePatternFlyDocs"
      `,
      inputSchema: {
        searchQuery: z.string().max(options.maxSearchLength).describe('Full or partial component name to search for (e.g., "button", "table", "*")')
      }
    },
    callback
  ];
};

searchPatternFlyDocsTool.toolName = 'searchPatternFlyDocs';

export { searchPatternFlyDocsTool, searchPatternFly };
