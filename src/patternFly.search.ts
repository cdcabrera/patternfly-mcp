import { fuzzySearch, type FuzzySearchResult } from './server.search';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
import {
  getPatternFlyMcpResources,
  type PatternFlyMcpAvailableResources, PatternFlyMcpDocsMeta,
  type PatternFlyMcpResourceMetadata
} from './patternFly.getResources';
import { PatternFlyMcpDocsCatalogDoc } from "./docs.embedded";

/**
 * A filtered MCP resource.
 *
 * @note Filtered resources lose their redundant version reference Map from `getPatternFlyMcpResources`
 * to simplify filtering. This data is STILL available inside the resource metadata, but is
 * potentially unnecessary since filtering already handles "version."
 */
type PatternFlyMcpResourceFilteredMetadata = Omit<PatternFlyMcpResourceMetadata, 'versions'>;

// type FilterPatternFlyResults = Omit<PatternFlyMcpResourceMetadata, 'versions'>;

/**
 * Filters for specific properties of PatternFly data.
 *
 * @interface FilterPatternFlyFilters
 *
 * @property [version] - PatternFly version to filter search results. Defaults to undefined for all versions.
 * @property [category] - Category to filter search results. Defaults to undefined for all categories.
 * @property [section] - Section to filter search results. Defaults to undefined for all sections.
 * @property [name] - Name to filter search results. Defaults to undefined for all names.
 */
interface FilterPatternFlyFilters {
  version?: string | undefined;
  category?: string | undefined;
  section?: string | undefined;
  name?: string | undefined;
}

/**
 * Options for filterPatternFly.
 *
 * @interface FilterPatternFlyOptions
 *
 * @property {Promise<PatternFlyMcpAvailableResources>} [mcpResources] - Object of multifaceted documentation entries to search.
 */
// interface FilterPatternFlyOptions {
//   mcpResources?: Promise<PatternFlyMcpAvailableResources> | Promise<PatternFlyMcpAvailableResources['resources']>;
// }

interface FilterPatternFlyResults {
  byEntry: (PatternFlyMcpDocsCatalogDoc & PatternFlyMcpDocsMeta)[];
  byResource: Map<string, PatternFlyMcpResourceFilteredMetadata>;
}

/**
 * Search result object returned by searchPatternFly.
 * Includes additional metadata and URLs.
 */
// interface SearchPatternFlyResult extends FuzzySearchResult, PatternFlyMcpResourceMetadata {
//  query: string;
// }
interface SearchPatternFlyResult extends FuzzySearchResult, PatternFlyMcpResourceFilteredMetadata {
  query: string;
}

// type PatternFlyMcpResourceFilteredMetadata = Omit<PatternFlyMcpResourceMetadata, 'versions'>;

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
 * @property totalAvailableMatches - Total number of available PatternFly keywords to match on.
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
 * @property {Promise<PatternFlyMcpAvailableResources>} [mcpResources] - Object of multifaceted documentation entries to search.
 * @property [allowWildCardAll] - Allow a search query to match all components.
 * @property [maxDistance] - Maximum edit distance for fuzzy search.
 * @property [maxResults] - Maximum number of results to return.lts.
 */
interface SearchPatternFlyOptions {
  mcpResources?: Promise<PatternFlyMcpAvailableResources>;
  allowWildCardAll?: boolean;
  maxDistance?: number;
  maxResults?: number;
  // pfVersion?: string | undefined;
  // propertyFilters?: FilterPatternFlyFilters
}

/**
 * Apply sequenced priority filters for predictable filtering, filter PatternFly data.
 *
 * @param mcpResources - A map of available PatternFly documentation entries to search. Defaults to `getPatternFlyMcpResources.resources`
 * @param {FilterPatternFlyFilters} filters - Available filters for PatternFly data.
 */
const filterPatternFly = async (
  mcpResources: Promise<PatternFlyMcpAvailableResources> | Map<string, PatternFlyMcpResourceFilteredMetadata> = getPatternFlyMcpResources.memo(),
  filters: FilterPatternFlyFilters
): Promise<FilterPatternFlyResults> => {
  const getResources = await mcpResources;
  const resources = (getResources as PatternFlyMcpAvailableResources)?.resources ||
    (getResources as Map<string, PatternFlyMcpResourceFilteredMetadata>);

  // Normalize filters
  const updatedFilters = Object.fromEntries(
    Object.entries(filters)
      .filter(([_key, value]) => value !== undefined)
      .map(([key, value]) => [key, value?.toLowerCase()])
  );

  // const filterVersion = filters?.version?.toLowerCase();
  // const filterCategory = filters?.category?.toLowerCase();
  // const filterSection = filters?.section?.toLowerCase();
  // const filterName = filters?.name?.toLowerCase();

  // const byResource = new Map<string, PatternFlyMcpResourceMetadata>();
  const byResource = new Map<string, PatternFlyMcpResourceFilteredMetadata>();
  const byEntry: (PatternFlyMcpDocsCatalogDoc & PatternFlyMcpDocsMeta)[] = [];

  for (const [name, resource] of resources) {
    const matchedEntries = resource.entries.filter(entry => {
      const matchesVersion = !updatedFilters.version || entry.version.toLowerCase() === updatedFilters.version;
      const matchesCategory = !updatedFilters.category || entry.category.toLowerCase() === updatedFilters.category;
      const matchesSection = !updatedFilters.section || entry.section.toLowerCase() === updatedFilters.section;
      const matchesName = !updatedFilters.name || entry.name.toLowerCase() === updatedFilters.name;
      // const matchesVersion = !filterVersion || entry.version.toLowerCase() === filterVersion;
      // const matchesCategory = !filterCategory || entry.category.toLowerCase() === filterCategory;
      // const matchesSection = !filterSection || entry.section.toLowerCase() === filterSection;
      // const matchesName = !filterName || entry.name.toLowerCase() === filterName;

      // Any missing filter registers as true. Only filters that are active run their check.
      return matchesVersion && matchesCategory && matchesSection && matchesName;
    });

    if (matchedEntries.length > 0) {
      byEntry.push(...matchedEntries);
      const { versions: _versions, ...filteredResource } = resource;

      byResource.set(name, {
        // ...resource,
        ...filteredResource,
        entries: matchedEntries
      });
    }
  }

  return {
    byEntry,
    byResource
  };

  /*
  if (filters.version) {
    const normalizedVersion = filters.version.toLowerCase();

    byEntry = byVersion[normalizedVersion] || [];
    // byResource = Array.from(resources.values())
    // .flatMap(resource => resource.versions[normalizedVersion]?.entries);
  } else {
    byEntry = Array.from(resources.values()).flatMap(resource => resource.entries);
  }

  // byResource = Object.entries(resources).forEach(
  // );

  byEntry = byEntry.filter(entry => {
    let isCategory = false;
    let isSection = false;
    let isName = false;

    if (filters.category) {
      isCategory = entry.category.toLowerCase() === filters.category.toLowerCase();
    }

    if (filters.section) {
      isSection = entry.section.toLowerCase() === filters.section.toLowerCase();
    }

    if (filters.name) {
      isName = entry.name.toLowerCase() === filters.name.toLowerCase();
    }

    return (isCategory && isSection && isName) || isCategory || isSection || isName;
  });
  */
  /*
  return results.filter(entry => {
    let isFiltered = false;

    if (filters.category) {
      isFiltered = entry.category.toLowerCase() === filters.category.toLowerCase();
    }

    if (filters.section) {
      isFiltered = entry.section.toLowerCase() === filters.section.toLowerCase();
    }

    if (filters.name) {
      isFiltered = entry.name.toLowerCase() === filters.name.toLowerCase();
    }

    return isFiltered;
  });
  */

  /*
  if (filters.category) {
    const normalizeCategory = filters.category.toLowerCase();

    results = results.filter(entry => entry.category.toLowerCase() === normalizeCategory);
  }

  if (filters.section) {
    const normalizeSection = filters.section.toLowerCase();

    results = results.filter(entry => entry.section.toLowerCase() === normalizeSection);
  }

  if (filters.name) {
    const normalizeName = filters.name.toLowerCase();

    results = results.filter(entry => entry.name.toLowerCase() === normalizeName);
  }

  return results;
   */

  // return {
  //  byEntry,
  //  byResource
  // };
};

/**
 * Memoized version of filterPatternFly
 */
filterPatternFly.memo = memo(filterPatternFly, DEFAULT_OPTIONS.resourceMemoOptions.default);

/**
 * Search for PatternFly component documentation URLs using fuzzy search.
 *
 * @param searchQuery - Search query string
 * @param {FilterPatternFlyFilters} filters - Available filters for PatternFly data.
 * @param settings - Optional settings object
 * @param settings.mcpResources - Object of multifaceted documentation entries to search.
 *    Applied as a dependency to help with testing.
 *     - `keywordsIndex`: Index of normalized keywords for fuzzy search
 *     - `keywordsMap`: Map of normalized keywords against versioned entries
 *     - `resources`: Map of names against entries
 * @param settings.allowWildCardAll - Allow a search query to match all components. Defaults to `false`.
 * @param settings.maxDistance - Maximum edit distance for fuzzy search. Defaults to `3`.
 * @param settings.maxResults - Maximum number of results to return. Defaults to `10`.
 * @returns Object containing search results and matched URLs
 *   - `isSearchWildCardAll`: Whether the search query matched all components
 *   - `firstExactMatch`: First exact match within search results
 *   - `exactMatches`: Exact matches within search results
 *   - `remainingMatches`: Contrast to `exactMatches`, the remaining matches within search results
 *   - `searchResults`: All search results, exact and remaining matches
 *   - `totalAvailableMatches`: Total number of available PatternFly keywords to match on.
 */
const searchPatternFly = async (searchQuery: string, filters: FilterPatternFlyFilters, {
  mcpResources = getPatternFlyMcpResources.memo(),
  allowWildCardAll = false,
  maxDistance = 3,
  maxResults = 10
}: SearchPatternFlyOptions = {}): Promise<SearchPatternFlyResults> => {
  const updatedResources = await mcpResources;
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
  // const refineSearchResult = async (result: FuzzySearchResult) => {
  for (const result of searchResults) {
    const versionMap = updatedResources.keywordsMap.get(result.item);

    if (versionMap) {
      const versionResults = filters.version ? versionMap.get(filters.version) : Array.from(versionMap.values()).flat();

      if (versionResults) {
        // versionResults.forEach(name => {
        for (const name of versionResults) {
          const namedResource = updatedResources.resources.get(name);

          if (!namedResource || searchResultsMap.has(name)) {
            continue;
          }

          // Omit versions from the result
          const { versions: _versions, ...filteredResource } = namedResource;
          // let updatedNamedResource: PatternFlyMcpResourceFilteredMetadata = { ...filteredResource };

          // Apply contextual filtering and flattening
          const { byResource } = await filterPatternFly(new Map([[name, { ...filteredResource }]]), filters);

          if (!byResource.has(name)) {
            continue;
          }
          /*
          if (pfVersion && namedResource.versions[pfVersion]) {
            updatedNamedResource = {
              ...updatedNamedResource,
              ...namedResource.versions[pfVersion]
            };
          }
          */

          // Apply property filters

          searchResultsMap.set(name, {
            ...result,
            ...byResource.get(name),
            // ...updatedNamedResource,
            query: searchQuery
          } as SearchPatternFlyResult);
        }
      }
    }
  }

  // searchResults.forEach(refineSearchResult);

  // Minor breakdown of search results
  const exactMatches = Array.from(searchResultsMap.values()).filter(result => result.matchType === 'exact' || result.matchType === 'all');
  const remainingMatches = Array.from(searchResultsMap.values()).filter(result => result.matchType !== 'exact' && result.matchType !== 'all');

  // Sort by distance then name
  const sortByDistanceByName = (a: SearchPatternFlyResult, b: SearchPatternFlyResult) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }

    return a.name.localeCompare(b.name);
  };

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
  filterPatternFly,
  searchPatternFly,
  type FilterPatternFlyFilters,
  // type FilterPatternFlyOptions,
  type SearchPatternFlyResult,
  type SearchPatternFlyResults
};
