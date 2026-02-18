import { fuzzySearch, type FuzzySearchResult } from './server.search';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
import {
  getPatternFlyMcpResources,
  type PatternFlyMcpAvailableResources,
  type PatternFlyMcpResourceMetadata
} from './patternFly.getResources';

/**
 * Search result object returned by searchPatternFly.
 * Includes additional metadata and URLs.
 */
interface SearchPatternFlyResult extends FuzzySearchResult, PatternFlyMcpResourceMetadata {
  query: string;
}

/**
 * Search results object returned by searchPatternFly.
 * Includes additional metadata and URLs.
 *
 * @interface SearchPatternFlyResults
 *
 * @property isSearchWildCardAll - Whether the search query matched all components
 * @property {SearchPatternFlyResult | undefined} firstExactMatch - First exact match within search results
 * @property {SearchPatternFlyResult[]} exactMatches - Exact matches within search results
 * @property {SearchPatternFlyResult[]} remainingMatches - Contrast to `exactMatches`, the remaining matches within search results
 * @property {SearchPatternFlyResult[]} searchResults - All search results, exact and remaining matches
 * @property {number} totalAvailableMatches - Total number of available PatternFly keywords to match on.
 */
interface SearchPatternFlyResults {
  isSearchWildCardAll: boolean;
  firstExactMatch: SearchPatternFlyResult | undefined;
  exactMatches: SearchPatternFlyResult[];
  remainingMatches: SearchPatternFlyResult[];
  searchResults: SearchPatternFlyResult[];
  totalAvailableMatches: number;
}

/**
 * Options for searchPatternFly.
 *
 * @interface SearchPatternFlyOptions
 *
 * @property {Promise<PatternFlyMcpAvailableResources>} [resources] - Object of multifaceted documentation entries to search.
 * @property [allowWildCardAll] - Allow a search query to match all components. Defaults to false.
 * @property [maxDistance] - Maximum edit distance for fuzzy search. Defaults to 3.
 * @property [maxResults] - Maximum number of results to return. Defaults to 10.
 * @property [pfVersion] - PatternFly version to filter search results. Defaults to undefined for all versions.
 */
interface SearchPatternFlyOptions {
  resources?: Promise<PatternFlyMcpAvailableResources>;
  allowWildCardAll?: boolean;
  maxDistance?: number;
  maxResults?: number;
  pfVersion?: string | undefined;
}

/**
 * Search for PatternFly component documentation URLs using fuzzy search.
 *
 * @param searchQuery - Search query string
 * @param settings - Optional settings object
 * @param settings.resources - Object of multifaceted documentation entries to search.
 * @param settings.allowWildCardAll - Allow a search query to match all components. Defaults to `false`.
 * @param settings.maxDistance - Maximum edit distance for fuzzy search. Defaults to `3`.
 * @param settings.maxResults - Maximum number of results to return. Defaults to `10`.
 * @param settings.pfVersion - PatternFly version to filter search results. Defaults to `undefined` for all versions.
 * @returns Object containing search results and matched URLs
 *   - `isSearchWildCardAll`: Whether the search query matched all components
 *   - `firstExactMatch`: First exact match within fuzzy search results
 *   - `exactMatches`: All exact matches within fuzzy search results
 *   - `searchResults`: Fuzzy search results
 */
const searchPatternFly = async (searchQuery: string, {
  resources = getPatternFlyMcpResources.memo(),
  allowWildCardAll = false,
  maxDistance = 3,
  maxResults = 10,
  pfVersion
}: SearchPatternFlyOptions = {}): Promise<SearchPatternFlyResults> => {
  const updatedResources = await resources;
  const isWildCardAll = searchQuery.trim() === '*' || searchQuery.trim().toLowerCase() === 'all' || searchQuery.trim() === '';
  const isSearchWildCardAll = allowWildCardAll && isWildCardAll;
  let searchResults: FuzzySearchResult[] = [];

  // Perform wildcard all search or fuzzy search
  if (isSearchWildCardAll) {
    searchResults = updatedResources.keywordsIndex.map(name => ({ matchType: 'all', distance: 0, item: name } as FuzzySearchResult));
  } else {
    searchResults = fuzzySearch(searchQuery, updatedResources.keywordsIndex, {
      maxDistance,
      maxResults,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    });
  }

  // Store refined results in a map for easy "did we already find this?" checks"
  const searchResultsMap = new Map<string, SearchPatternFlyResult>();

  // Refine search results with version filtering and mapping
  const refineSearchResult = (result: FuzzySearchResult) => {
    const versionMap = updatedResources.keywordsMap.get(result.item);

    if (versionMap) {
      const versionResults = pfVersion ? versionMap.get(pfVersion) : Array.from(versionMap.values()).flat();

      if (versionResults) {
        versionResults.forEach(name => {
          const namedResource = updatedResources.resources.get(name);

          if (namedResource && !searchResultsMap.has(name)) {
            let updatedNamedResource = { ...namedResource };

            // If a PF version is optioned-in, apply contextual versioning to the result
            if (pfVersion && namedResource.versions[pfVersion]) {
              updatedNamedResource = {
                ...updatedNamedResource,
                ...namedResource.versions[pfVersion]
              };
            }

            searchResultsMap.set(name, {
              ...result,
              ...updatedNamedResource,
              query: searchQuery
            } as SearchPatternFlyResult);
          }
        });
      }
    }
  };

  searchResults.forEach(refineSearchResult);

  // Sort by distance then name
  const sortByDistanceByName = (a: SearchPatternFlyResult, b: SearchPatternFlyResult) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }

    return a.name.localeCompare(b.name);
  };

  // Minor breakdown of search results
  const exactMatches = Array.from(searchResultsMap.values()).filter(result => result.matchType === 'exact' || result.matchType === 'all');
  const remainingMatches = Array.from(searchResultsMap.values()).filter(result => result.matchType !== 'exact' && result.matchType !== 'all');

  // Apply sorting
  const sortedExactMatches = exactMatches.sort(sortByDistanceByName);
  const sortedRemainingMatches = remainingMatches.sort(sortByDistanceByName);
  const sortedSearchResults = Array.from(searchResultsMap.values()).sort(sortByDistanceByName);

  return {
    isSearchWildCardAll,
    firstExactMatch: sortedExactMatches[0],
    exactMatches: sortedExactMatches.slice(0, maxResults),
    remainingMatches: (maxResults - exactMatches.length) < 0 ? [] : sortedRemainingMatches.slice(0, maxResults - exactMatches.length),
    searchResults: sortedSearchResults.slice(0, maxResults),
    totalAvailableMatches: updatedResources.keywordsIndex.length
  };
};

/**
 * Memoized version of searchPatternFly.
 */
searchPatternFly.memo = memo(searchPatternFly, DEFAULT_OPTIONS.toolMemoOptions.searchPatternFlyDocs);

export {
  searchPatternFly,
  type SearchPatternFlyResult,
  type SearchPatternFlyResults
};
