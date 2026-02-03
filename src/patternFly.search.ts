import { basename } from 'node:path';
import { fuzzySearch, type FuzzySearchResult } from './server.search';
import { memo } from './server.caching';
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
 * Search PatternFly documentation paths with fuzzy search.
 *
 * @param {string} searchQuery - The search query to use for fuzzy search
 * @param [options] - Optional search options
 * @param [options.documentation] - Object of multifaceted documentation entries to search, defaults to `getPatternFlyMcpDocs`
 * @param [options.allowWildCardAll] - Allow a search query to match all components. Defaults to false.
 * @returns {SearchPatternFlyResults} - Search results object
 */
const searchPatternFlyDocumentationPaths = (searchQuery: string, {
  documentation = getPatternFlyMcpDocs.memo(),
  allowWildCardAll = false
} = {}) => {
  const isWildCardAll = searchQuery.trim() === '*' || searchQuery.trim().toLowerCase() === 'all' || searchQuery.trim() === '';
  const isSearchWildCardAll = allowWildCardAll && isWildCardAll;
  let searchResults: FuzzySearchResult[] = [];

  if (isSearchWildCardAll) {
    searchResults = documentation.pathIndex.map(path => ({ matchType: 'all', distance: 0, item: path } as FuzzySearchResult));
  } else {
    searchResults = fuzzySearch(searchQuery, documentation.pathIndex, {
      maxDistance: 3,
      maxResults: 10,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    });

    if (!searchResults.length) {
      // Fallback results, in the event the fileName, suffix, is a match but the path is not try a smaller string.
      const baseName = basename(searchQuery);

      if (baseName) {
        const baseSearch = fuzzySearch(baseName, documentation.pathIndex, {
          maxDistance: 3,
          maxResults: 10,
          isFuzzyMatch: true,
          deduplicateByNormalized: true
        });

        const suffixMatch = baseSearch.find(searchResult => searchResult.item.endsWith(baseName));

        if (suffixMatch) {
          searchResults = [suffixMatch];
        }
      }
    }
  }

  const exactMatches = searchResults.filter(result => result.matchType === 'exact');

  return {
    isSearchWildCardAll,
    firstExactMatch: exactMatches[0],
    exactMatches: exactMatches,
    searchResults: searchResults
  };
};

/**
 * Memoized version of searchPatternFlyDocumentationPaths.
 */
searchPatternFlyDocumentationPaths.memo = memo(searchPatternFlyDocumentationPaths, DEFAULT_OPTIONS.toolMemoOptions.searchPatternFlyDocs);

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

export { searchPatternFly, searchPatternFlyDocumentationPaths, type SearchPatternFlyResults, type SearchPatternFlyResult };
