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
  getPatternFlyMcpResources,
  getPatternFlyReactComponentNames
} from './patternFly.getResources';

/**
 * Search result object returned by searchPatternFly.
 * Includes additional metadata and URLs.
 *
 * @interface SearchPatternFlyResult
 * @extends FuzzySearchResult
 * @property {string} doc - PatternFly documentation URL
 * @property {boolean} isSchemasAvailable - Whether JSON schemas are available for the component
 * @property {string | undefined} schema - JSON schema URL, if available
 * @property {string[]} urls - List of documentation URLs
 * @property {string[]} guidanceUrls - List of agent guidance URLs
 */
interface SearchPatternFlyResult extends FuzzySearchResult {
  doc: string;
  isSchemasAvailable: boolean;
  schema: string | undefined;
  urls: string[];
  guidanceUrls: string[];
  query: string | undefined;
}

/**
 * Search results object returned by searchPatternFly.
 * Includes additional metadata and URLs.
 *
 * @interface SearchPatternFlyResults
 * @property {boolean} isSearchWildCardAll - Whether the search query matched all components
 * @property {SearchPatternFlyResult | undefined} firstExactMatch - First exact match within fuzzy search results
 * @property {SearchPatternFlyResult[]} exactMatches - All exact matches within fuzzy search results
 * @property {SearchPatternFlyResult[]} searchResults - Fuzzy search results
 */
interface SearchPatternFlyResults {
  isSearchWildCardAll: boolean,
  firstExactMatch: SearchPatternFlyResult | undefined,
  exactMatches: SearchPatternFlyResult[],
  searchResults: SearchPatternFlyResult[]
}

/**
 * Search for PatternFly component documentation URLs using fuzzy search.
 *
 * @param searchQuery - Search query string
 * @param settings - Optional settings object
 * @param settings.components - Object of multifaceted component names to search.
 * @param settings.documentation - Object of multifaceted documentation entries to search.
 * @param settings.resources - Object of multifaceted resources entries to search, e.g. all component names, documentation and guidance URLs, etc.
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
  resources = getPatternFlyMcpResources.memo(),
  allowWildCardAll = false
} = {}): SearchPatternFlyResults => {
  const isWildCardAll = searchQuery.trim() === '*' || searchQuery.trim().toLowerCase() === 'all' || searchQuery.trim() === '';
  const isSearchWildCardAll = allowWildCardAll && isWildCardAll;
  let searchResults: FuzzySearchResult[] = [];

  if (isSearchWildCardAll) {
    searchResults = resources.nameIndex.map(name => ({ matchType: 'all', distance: 0, item: name } as FuzzySearchResult));
  } else {
    searchResults = fuzzySearch(searchQuery, resources.nameIndex, {
      maxDistance: 3,
      maxResults: 10,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    });
  }

  const extendResults = (results: FuzzySearchResult[] = [], query?: string) => results.map(result => {
    const isSchemasAvailable = components.componentNamesWithSchema.includes(result.item);
    const guidanceUrls = documentation.byNameWithPathGuidance[result.item] || [];
    const urls = documentation.byNameWithPathNoGuidance[result.item] || [];

    return {
      ...result,
      doc: `patternfly://docs/${result.item}`,
      isSchemasAvailable,
      schema: isSchemasAvailable ? `patternfly://schemas/${result.item}` : undefined,
      urls,
      guidanceUrls,
      query
    };
  });

  const exactMatches = searchResults.filter(result => result.matchType === 'exact');
  const extendedExactMatches: SearchPatternFlyResult[] = extendResults(exactMatches, searchQuery);
  const extendedSearchResults: SearchPatternFlyResult[] = extendResults(searchResults, searchQuery);

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
            `No PatternFly resources found matching "${searchQuery}"`,
            '',
            '---',
            '',
            '**Important**:',
            '  - Use a search all ("*") to find all available resources.'
          )
        }]
      };
    }

    const results = searchResults.map(result => {
      const urlList = result.urls.length
        ? stringJoin.newline(
          ...result.urls.map((url: string, index: number) => `  ${index + 1}. ${url}`)
        )
        : '  - No documentation URLs found';

      const guidanceUrlList = result.guidanceUrls.length
        ? stringJoin.newline(
          ...result.guidanceUrls.map((url: string, index: number) => `  ${index + 1}. ${url}`)
        )
        : '  - No guidance URLs found';

      return stringJoin.newline(
        '',
        `## ${result.item}`,
        `**Match Type**: ${result.matchType}`,
        `### "usePatternFlyDocs" tool resource URLs`,
        `#### Documentation URLs`,
        urlList,
        `#### AI guidance URLs`,
        guidanceUrlList,
        `### Resources metadata`,
        ` - **Component name**: ${result.item}`,
        ` - **JSON Schemas**: ${result.isSchemasAvailable ? 'Available' : 'Not available'}`
      );
    });

    return {
      content: [{
        type: 'text',
        text: stringJoin.newline(
          `# Search results for "${isSearchWildCardAll ? 'all resources' : searchQuery}", ${searchResults.length} matches found:`,
          ...results,
          '',
          '---',
          '',
          '**Important**:',
          '  - Use the "usePatternFlyDocs" tool with the above URLs to fetch resource content.',
          '  - Use a search all ("*") to find all available resources.'
        )
      }]
    };
  };

  return [
    'searchPatternFlyDocs',
    {
      description: `Search PatternFly resources and get component names with documentation and guidance URLs. Supports case-insensitive partial and all ("*") matches.

      **Usage**:
        1. Input a "searchQuery" to find PatternFly documentation and guideline URLs, and component names.
        2. Use the returned resource names OR URLs with the "usePatternFlyDocs" tool to get markdown documentation, guidelines, and component JSON schemas.

      **Returns**:
        - Component and resource names that can be used with "usePatternFlyDocs"
        - Documentation and guideline URLs that can be used with "usePatternFlyDocs"
      `,
      inputSchema: {
        searchQuery: z.string().max(options.maxSearchLength).describe('Full or partial resource or component name to search for (e.g., "button", "react", "*")')
      }
    },
    callback
  ];
};

searchPatternFlyDocsTool.toolName = 'searchPatternFlyDocs';

export { searchPatternFlyDocsTool, searchPatternFly, type SearchPatternFlyResults, type SearchPatternFlyResult };
