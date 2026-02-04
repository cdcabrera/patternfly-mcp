import { fuzzySearch, type FuzzySearchResult } from './server.search';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
import { getPatternFlyMcpDocs, type PatternFlyMcpResourceMetadata } from './patternFly.getResources';

/**
 * Search result object returned by searchPatternFly.
 * Includes additional metadata and URLs.
 */
type SearchPatternFlyResult = FuzzySearchResult & PatternFlyMcpResourceMetadata & { query: string };

/**
 * Search results object returned by searchPatternFly.
 * Includes additional metadata and URLs.
 *
 * @interface SearchPatternFlyResults
 *
 * @property isSearchWildCardAll - Whether the search query matched all components
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
 * @param settings.documentation - Object of multifaceted documentation entries to search.
 * @param settings.allowWildCardAll - Allow a search query to match all components. Defaults to false.
 * @returns Object containing search results and matched URLs
 */
const searchPatternFly = async (searchQuery: string, {
  documentation = getPatternFlyMcpDocs.memo(),
  allowWildCardAll = false
} = {}): Promise<SearchPatternFlyResults> => {
  const updatedDocumentation = await documentation;
  const isWildCardAll = searchQuery.trim() === '*' || searchQuery.trim().toLowerCase() === 'all' || searchQuery.trim() === '';
  const isSearchWildCardAll = allowWildCardAll && isWildCardAll;
  let searchResults: FuzzySearchResult[] = [];

  if (isSearchWildCardAll) {
    searchResults = updatedDocumentation.nameIndex.map(name => ({ matchType: 'all', distance: 0, item: name } as FuzzySearchResult));
  } else {
    searchResults = fuzzySearch(searchQuery, updatedDocumentation.nameIndex, {
      maxDistance: 3,
      maxResults: 10,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    });
  }

  const updatedSearchResults = searchResults.map((result: FuzzySearchResult) => {
    const resource = updatedDocumentation.resources.get(result.item);

    return {
      ...result,
      ...resource,
      query: searchQuery
    };
  }) as SearchPatternFlyResult[];

  const exactMatches = updatedSearchResults.filter(result => result.matchType === 'exact');

  return {
    isSearchWildCardAll,
    firstExactMatch: exactMatches[0],
    exactMatches: exactMatches,
    searchResults: updatedSearchResults
  };
};

/**
 * Memoized version of searchComponents.
 */
searchPatternFly.memo = memo(searchPatternFly, DEFAULT_OPTIONS.toolMemoOptions.searchPatternFlyDocs);

export {
  searchPatternFly,
  type SearchPatternFlyResult,
  type SearchPatternFlyResults
};
