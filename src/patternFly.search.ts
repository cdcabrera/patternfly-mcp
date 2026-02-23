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
 * Options for searchPatternFly.
 *
 * @interface SearchPatternFlyOptions
 *
 * @property {Promise<PatternFlyMcpAvailableResources>} [resources] - Object of multifaceted documentation entries to search.
 * @property [allowWildCardAll] - Allow a search query to match all components. Defaults to false.
 * @property [maxResults] - Maximum number of results to return. Defaults to 10.
 * @property [pfVersion] - PatternFly version to filter search results. Defaults to undefined for all versions.
 */
interface SearchPatternFlyOptions {
  resources?: Promise<PatternFlyMcpAvailableResources>,
  allowWildCardAll?: boolean,
  maxResults?: number,
  pfVersion?: string
}

/**
 * Search for PatternFly component documentation URLs using fuzzy search.
 *
 * @param searchQuery - Search query string
 * @param settings - Optional settings object
 * @param settings.resources - Object of multifaceted documentation entries to search.
 * @param settings.allowWildCardAll - Allow a search query to match all components. Defaults to false.
 * @param settings.maxResults - Maximum number of results to return. Defaults to 10.
 * @param settings.pfVersion - PatternFly version to filter search results. Defaults to undefined for all versions.
 * @returns Object containing search results and matched URLs
 *   - `isSearchWildCardAll`: Whether the search query matched all components
 *   - `firstExactMatch`: First exact match within fuzzy search results
 *   - `exactMatches`: All exact matches within fuzzy search results
 *   - `searchResults`: Fuzzy search results
 */
const searchPatternFly = async (searchQuery: string, {
  resources = getPatternFlyMcpResources.memo(),
  allowWildCardAll = false,
  maxResults = 10,
  pfVersion
}: SearchPatternFlyOptions = {}): Promise<SearchPatternFlyResults> => {
  const updatedResources = await resources;
  const isWildCardAll = searchQuery.trim() === '*' || searchQuery.trim().toLowerCase() === 'all' || searchQuery.trim() === '';
  const isSearchWildCardAll = allowWildCardAll && isWildCardAll;
  let searchResults: FuzzySearchResult[] = [];

  if (isSearchWildCardAll) {
    searchResults = updatedResources.keywordsIndex.map(name => ({ matchType: 'all', distance: 0, item: name } as FuzzySearchResult));
  } else {
    searchResults = fuzzySearch(searchQuery, updatedResources.keywordsIndex, {
      maxDistance: 3,
      maxResults,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    });
  }

  const updatedSearchResults = searchResults.map((result: FuzzySearchResult) => {
    /*
    const resource = updatedResources.resources.get(result.item);

    if (resource) {
      return [{
        ...result,
        ...resource,
        query: searchQuery
      }];
    }*/

    const versionMap = updatedResources.keywordsMap.get(result.item);

    if (versionMap) {
      const versionResults = pfVersion ? versionMap.get(pfVersion) : Array.from(versionMap.values()).flat();

      if (versionResults) {
        return versionResults.map(name => ({
          ...result,
          ...updatedResources.resources.get(name),
          query: searchQuery
        }));
      }
    }

    /*
    if (versionMap && pfVersion === undefined) {
      return Array.from(versionMap).flatMap(([_version, names]) => names).map(name => ({
        ...result,
        ...updatedResources.resources.get(name),
        query: searchQuery
      }));
    }

    if (versionMap && pfVersion !== undefined) {
      const versionResults = versionMap.get(pfVersion);

      if (versionResults) {
        return versionResults.map(name => ({
          ...result,
          ...updatedResources.resources.get(name),
          query: searchQuery
        }));
      }
    }
     */

    /*
    const resources = updatedResources.keywordsMap.get(result.item);

    if (resources) {
      return resources.map(resource => ({
        ...result,
        ...updatedResources.resources.get(resource),
        query: searchQuery
      }));
    }
    */

    return [];
  }) as (SearchPatternFlyResult[])[];

  const flattenedResults = updatedSearchResults.flat();
  const exactMatches = flattenedResults.filter(result => result.matchType === 'exact' || result.matchType === 'all');

  return {
    isSearchWildCardAll,
    firstExactMatch: exactMatches[0],
    exactMatches,
    searchResults: flattenedResults
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
