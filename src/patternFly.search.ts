import {
  fuzzySearch,
  type FuzzySearch,
  type FuzzySearchOptions,
  type FuzzySearchResult
} from './server.search';
import { memo } from './server.caching';
// import { isSha1HexLike } from './server.helpers';
import { DEFAULT_OPTIONS } from './options.defaults';
import {
  getPatternFlyMcpResources,
  type PatternFlyMcpAvailableResources,
  type PatternFlyMcpDocsMeta,
  type PatternFlyMcpResourceMetadata
} from './patternFly.getResources';
// import { parsePatternFlyUri } from './patternFly.helpers';
import { type PatternFlyMcpDocsCatalogDoc } from './docs.embedded';

/**
 * A filtered MCP resource.
 *
 * @note Filtered resources lose their redundant version reference Map from `getPatternFlyMcpResources`
 * to simplify filtering. This data is STILL available inside the resource metadata, but is
 * potentially unnecessary since filtering already handles "version."
 */
type PatternFlyMcpResourceFilteredMetadata = Omit<PatternFlyMcpResourceMetadata, 'versions'>;

/**
 * Filters for specific properties of PatternFly data.
 *
 * @interface FilterPatternFlyFilters
 *
 * @property [version] - PatternFly version to filter search results. Defaults to undefined for all versions.
 * @property [category] - Category to filter search results. Defaults to undefined for all categories.
 * @property [section] - Section to filter search results. Defaults to undefined for all sections.
 * @property [name] - Name to filter search results. Defaults to undefined for all names.
 * @property [pathUri] - Document path or URI to filter search results. Defaults to undefined for all paths and URIs.
 */
interface FilterPatternFlyFilters {
  version?: string | undefined;
  category?: string | undefined;
  section?: string | undefined;
  name?: string | undefined;
  pathUri?: string | undefined;
}

/**
 * Result object returned by filterPatternFly.
 *
 * @interface FilterPatternFlyResults
 *
 * @property {PatternFlyMcpDocsCatalogDoc & PatternFlyMcpDocsMeta} byEntry - Array of filtered documentation entries.
 * @property {Map<string, PatternFlyMcpResourceFilteredMetadata>} byResource - Map of filtered resources by resource name.
 */
interface FilterPatternFlyResults {
  byEntry: (PatternFlyMcpDocsCatalogDoc & PatternFlyMcpDocsMeta)[];
  byResource: Map<string, PatternFlyMcpResourceFilteredMetadata>;
}

/**
 * Search result object returned by searchPatternFly. Includes additional metadata.
 *
 * @interface SearchPatternFlyResult
 *
 * @extends FuzzySearchResult
 * @extends PatternFlyMcpResourceFilteredMetadata
 *
 * @property query - Search query used to generate the result.
 */
interface SearchPatternFlyResult extends FuzzySearchResult, PatternFlyMcpResourceFilteredMetadata {
  query: string;
}

/**
 * Search results object returned by searchPatternFly.
 * Includes additional metadata and URLs.
 *
 * @interface SearchPatternFlyResults
 *
 * @property isSearchWildCardAll - Whether the search query matched all components
 * @property {SearchPatternFlyResult | undefined} firstExactMatch - Exact-ranked result
 * @property {SearchPatternFlyResult[]} exactMatches - Exact matches within search results
 * @property {SearchPatternFlyResult[]} remainingMatches - Contrast to `exactMatches`, the remaining matches within search results
 * @property {SearchPatternFlyResult[]} searchResults - All search results, exact and remaining matches
 * @property totalPotentialMatches - Total number of available PatternFly keywords to match on, what was possible before narrowing.
 * @property totalResults - Total number of actual resources that meet all criteria.
 */
interface SearchPatternFlyResults {
  isSearchWildCardAll: boolean;
  firstExactMatch: SearchPatternFlyResult | undefined;
  exactMatches: SearchPatternFlyResult[];
  remainingMatches: SearchPatternFlyResult[];
  searchResults: SearchPatternFlyResult[];
  totalPotentialMatches: number;
  totalResults: number;
}

/**
 * Options for searchPatternFly.
 *
 * @interface SearchPatternFlyOptions
 *
 * @property {Promise<PatternFlyMcpAvailableResources>} [mcpResources] - Object of multifaceted documentation entries to search.
 * @property [allowWildCardAll] - Allow a search query to match all components.
 * @property [dynamicFilter] - Allow a search query to attempt a multi-filter match on returned search results for tighter results.
 * @property [maxDistance] - Maximum edit distance for fuzzy search.
 * @property [maxResults] - Maximum number of results to return.
 */
interface SearchPatternFlyOptions {
  mcpResources?: Promise<PatternFlyMcpAvailableResources>;
  allowWildCardAll?: boolean;
  dynamicFilter?: boolean;
  maxDistance?: number;
  maxResults?: number;
}

const PF_PRIORITY_FILTERS: (keyof FilterPatternFlyFilters)[] = ['version', 'category', 'section', 'name', 'pathUri'];

/**
 * Apply sequenced priority filters for predictable filtering, filter PatternFly data.
 *
 * @note It is tempting to apply a default version to this function. Do not. Architecture
 * dictates that this function remains purely data-driven, apply default versions in the caller.
 * See both MCP resources and tools for examples.
 *
 * @note This is a predictable filter, not a search. Use searchPatternFly for fuzzy search.
 * - Has case-insensitive filtering for all fields
 * - Exact "version" filtering only
 * - Has `prefix`, `suffix` filtering for any non-"version" field.
 *
 * @note Filter formats are generally assumed to be string values. If expanding to other types, ensure
 * proper handling of non-string values. Future updates should align with the string coercion used
 * in other code base searches.
 *
 * @param {FilterPatternFlyFilters} filters - Available filters for PatternFly data.
 * @param [mcpResources] - An optional map of available PatternFly documentation entries to search.
 *     Internally, defaults to `getPatternFlyMcpResources.resources`
 * @returns {Promise<FilterPatternFlyResults>} - Filtered PatternFly results.
 * - `byEntry`: Array of filtered documentation entries.
 * - `byResource`: Map of filtered resources by resource name.
 */
const filterPatternFly = async (
  filters: FilterPatternFlyFilters | undefined,
  mcpResources?: Promise<PatternFlyMcpAvailableResources> | Map<string, PatternFlyMcpResourceFilteredMetadata>
): Promise<FilterPatternFlyResults> => {
  const getResources = await (mcpResources || getPatternFlyMcpResources.memo());
  const resources = (getResources as PatternFlyMcpAvailableResources)?.resources ||
    (getResources as Map<string, PatternFlyMcpResourceFilteredMetadata>);

  // Normalize filters - Currently, this is set to string filtering. Review expanding if/when necessary.
  let updatedFilters: FilterPatternFlyFilters = {};

  if (filters) {
    // Allow strings and coerced numbers as strings
    updatedFilters = Object.fromEntries(
      Object.entries(filters)
        .filter(([_key, value]) => (typeof value === 'string' || typeof value === 'number') && String(value).trim().length > 0)
        .map(([key, value]) => [key, String(value).trim().toLowerCase()])
    );
  }

  // Filter matching for resources and entries
  const byResource = new Map<string, PatternFlyMcpResourceFilteredMetadata>();
  const byEntry: (PatternFlyMcpDocsCatalogDoc & PatternFlyMcpDocsMeta)[] = [];
  const filterMatch = (propertyValue: unknown, filterValue: string) => {
    const normalizePropertyValue = String(propertyValue).trim().toLowerCase();

    return normalizePropertyValue === filterValue ||
      normalizePropertyValue.startsWith(filterValue) ||
      normalizePropertyValue.endsWith(filterValue);
  };

  for (const [name, resource] of resources) {
    const matchedEntries = resource.entries.filter(entry => {
      const matchesVersion = !updatedFilters.version || String(entry.version).toLowerCase() === updatedFilters.version;
      const matchesCategory = !updatedFilters.category || filterMatch(entry.category, updatedFilters.category);
      const matchesSection = !updatedFilters.section || filterMatch(entry.section, updatedFilters.section);
      const matchesUriPath = !updatedFilters.pathUri || filterMatch(entry.path, updatedFilters.pathUri) ||
        filterMatch(entry.uriId, updatedFilters.pathUri) || filterMatch(entry.uriSchemas, updatedFilters.pathUri) ||
        filterMatch(entry.uriSchemasId, updatedFilters.pathUri) || filterMatch(entry.uri, updatedFilters.pathUri);

      // Filter order matters specific id -> group id -> group name
      const matchesName = !updatedFilters.name || filterMatch(entry.id, updatedFilters.name) ||
        filterMatch(entry.groupId, updatedFilters.name) || filterMatch(entry.name, updatedFilters.name);

      // Any missing filter registers as true. Only filters that are active run their check.
      return matchesVersion && matchesCategory && matchesSection && matchesUriPath && matchesName;
    });

    if (matchedEntries.length > 0) {
      byEntry.push(...matchedEntries);
      const { versions, ...filteredResource } = resource;
      let versionContextualProperties = {};

      // Apply version contextual properties, typically group/resource related URIs.
      if (updatedFilters.version && versions?.[updatedFilters.version]) {
        // General props version dependent
        versionContextualProperties = {
          isSchemasAvailable: versions[updatedFilters.version]?.isSchemasAvailable,
          uri: versions[updatedFilters.version]?.uri,
          uriSchemas: versions[updatedFilters.version]?.uriSchemas,
          uriSchemasId: versions[updatedFilters.version]?.uriSchemasId
        };
      }

      byResource.set(name, {
        ...filteredResource,
        ...versionContextualProperties,
        entries: matchedEntries
      });
    }
  }

  return {
    byEntry,
    byResource
  };
};

/**
 * Memoized version of filterPatternFly
 */
filterPatternFly.memo = memo(filterPatternFly, DEFAULT_OPTIONS.resourceMemoOptions.default);

/**
 * Use iteration to filter down the tightest possible results. Iteratively applies the
 * searchQuery to empty filters; if those results have a single match, they're returned.
 *
 * @param searchQuery
 * @param filters
 * @param mcpResources
 * @param [options] - Optional settings object
 * @param [options.prioritizedFilters] - Array of filters to prioritize. Defaults to `['name', 'section', 'category', 'version']`.
 * @param [options.maxResultsLimit] - Max number of results internal conditions need to match before they return the original result. Defaults to `1`.
 * @param [options.useExistingFilters] - Use the existing filters or bypass them. Defaults to `true`.
 * @returns {Promise<FilterPatternFlyResults>} - A Promise resolving to the filtering results.
 */
const dynamicFilterPatternFly = async (
  searchQuery: string, filters: FilterPatternFlyFilters | undefined,
  mcpResources?: Promise<PatternFlyMcpAvailableResources> | Map<string, PatternFlyMcpResourceFilteredMetadata>,
  {
    prioritizedFilters = PF_PRIORITY_FILTERS,
    maxResultsLimit = 1,
    useExistingFilters = true
  }: { prioritizedFilters?: (keyof FilterPatternFlyFilters)[]; maxResultsLimit?: number; useExistingFilters?: boolean } = {}
): Promise<FilterPatternFlyResults> => {
  // Base filter check
  const originalOutput = await filterPatternFly.memo(filters, mcpResources);

  // Have a match from the base check? Return that.
  if (originalOutput.byEntry.length === maxResultsLimit) {
    return originalOutput;
  }

  for (const filter of prioritizedFilters) {
    // Skip existing filters if `useExistingFilters` is true
    if (useExistingFilters && filters && filters[filter]) {
      continue;
    }

    const updatedFilter = { ...filters, [filter]: searchQuery };
    const output = await filterPatternFly.memo(updatedFilter, mcpResources);

    // Have a match already? Return that.
    if (output.byEntry.length === maxResultsLimit) {
      return output;
    }
  }

  return {
    ...originalOutput
  };
};

/**
 * Memoized version of dynamicFilterPatternFly
 */
dynamicFilterPatternFly.memo = memo(dynamicFilterPatternFly, DEFAULT_OPTIONS.resourceMemoOptions.default);

/**
 * Search for PatternFly component documentation URLs using fuzzy search.
 *
 * @note It is tempting to apply a default version to this function. Do not. Architecture
 * dictates that this function remains purely data-driven, apply default versions in the caller.
 * See both MCP resources and tools for examples.
 *
 * @note Uses `filterPatternFly` for additional filtering.
 *
 * @param searchQuery - Search query. Values are coerced to string for fuzzy search.
 * @param {FilterPatternFlyFilters} filters - Available filters for PatternFly data.
 * @param [settings] - Optional settings object
 * @param [settings.mcpResources] - Optional function object of multifaceted documentation entries to search.
 *    Applied as a dependency to help with testing. Defaults to `getPatternFlyMcpResources`
 *     - `keywordsIndex`: Index of normalized keywords for fuzzy search
 *     - `keywordsMap`: Map of normalized keywords against versioned entries
 *     - `resources`: Map of names against entries
 * @param [settings.allowWildCardAll] - Allow a search query to match all resources. Defaults to `false`.
 * @param [settings.dynamicFilter] - Allow a search query to attempt a multi-filter match on returned search results. Defaults to `false`.
 *   Useful for narrowing down search results to a specific resource.
 * @param [settings.maxDistance] - Maximum edit distance for fuzzy search. Defaults to `3`.
 * @param [settings.maxResults] - Maximum number of results to return. Defaults to `10`.
 * @returns Object containing search results and matched URLs
 *   - `isSearchWildCardAll`: Whether the search query matched all resources
 *   - `firstExactMatch`: Exact-ranked result
 *   - `exactMatches`: Exact matches within search results
 *   - `remainingMatches`: Contrast to `exactMatches`, the remaining matches within search results
 *   - `searchResults`: All search results, exact and remaining matches
 *   - `totalPotentialMatches`: Total number of available PatternFly keywords to match on, what was possible before narrowing.
 *   - `totalResults`: Total number of actual resources that meet all criteria.
 */
const searchPatternFly = async (searchQuery: unknown, filters?: FilterPatternFlyFilters | undefined, {
  mcpResources,
  allowWildCardAll = false,
  dynamicFilter = false,
  maxDistance = 3,
  maxResults = 10
}: SearchPatternFlyOptions = {}): Promise<SearchPatternFlyResults> => {
  const coercedSearchQuery = String(searchQuery).trim();
  const updatedResources = await (mcpResources || getPatternFlyMcpResources.memo());
  const updatedFilters = filters || {};
  const isWildCardAll = coercedSearchQuery === '*' || coercedSearchQuery.toLowerCase() === 'all' || coercedSearchQuery === '';
  const isSearchWildCardAll = allowWildCardAll && isWildCardAll;
  const pathMatchName = updatedResources.pathIndex?.get(coercedSearchQuery);
  const uriMatchName = updatedResources.uriIndex?.get(coercedSearchQuery);
  const hashMatchName = updatedResources.hashIndex?.get(coercedSearchQuery);
  let search: FuzzySearch | undefined;
  let searchResults: FuzzySearchResult[] = [];

  // Perform wildcard all search or fuzzy search
  if (isSearchWildCardAll) {
    searchResults = updatedResources.keywordsIndex.map(name => ({ matchType: 'all', distance: 0, item: name } as FuzzySearchResult));
  } else if (pathMatchName || uriMatchName || hashMatchName) {
    searchResults = [
      { matchType: 'exact', distance: 0, item: pathMatchName || uriMatchName || hashMatchName } as FuzzySearchResult
    ];
  } else {
    /*
    const patternflyUri = parsePatternFlyUri.memo(coercedSearchQuery);
    const isShaHex = isSha1HexLike(coercedSearchQuery);
    const fuzzySearchSettings: FuzzySearchOptions = {
      maxDistance,
      maxResults,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    };

    if (patternflyUri) {
      fuzzySearchSettings.maxDistance = 1;
      fuzzySearchSettings.isFuzzyMatch = false;
      fuzzySearchSettings.isContainsMatch = false;
      fuzzySearchSettings.isPartialMatch = false;
    }

    if (isShaHex) {
      fuzzySearchSettings.maxDistance = 0;
      fuzzySearchSettings.isFuzzyMatch = false;
      fuzzySearchSettings.isPrefixMatch = false;
      fuzzySearchSettings.isSuffixMatch = false;
      fuzzySearchSettings.isContainsMatch = false;
      fuzzySearchSettings.isPartialMatch = false;
    }*/

    const fuzzySearchSettings: FuzzySearchOptions = {
      maxDistance,
      maxResults,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    };

    // Pass the original searchQuery, fuzzySearch has its own normalization.
    search = fuzzySearch(searchQuery, updatedResources.keywordsIndex, fuzzySearchSettings);
    searchResults = search.results;
  }

  // Store refined results in a map for easy "did we already find this?" checks
  const searchResultsMap = new Map<string, SearchPatternFlyResult>();
  const searchResultsFilterMap = new Map<string, PatternFlyMcpResourceFilteredMetadata>();
  const fuzzyResultsMap = new Map<string, FuzzySearchResult>();

  // Refine search results with versioning for filtering and remapping
  for (const result of searchResults) {
    const versionMap = updatedResources.keywordsMap.get(result.item);

    if (versionMap) {
      const versionResults = updatedFilters.version
        ? versionMap.get(updatedFilters.version)
        : Array.from(versionMap.values()).flat();

      if (versionResults) {
        for (const name of versionResults) {
          const namedResource = updatedResources.resources.get(name);

          if (!namedResource || searchResultsMap.has(name)) {
            continue;
          }

          if (!fuzzyResultsMap.has(name)) {
            // Set results for filtering.
            searchResultsFilterMap.set(name, namedResource);

            // Set fuzzy results so we can map back the searchResultsFilterMap filtered output.
            fuzzyResultsMap.set(name, result);
          }
        }
      }
    }
  }

  let filtered: FilterPatternFlyResults;

  // Filter resources. Dynamic filtering applies the search query to each filter as a fallback.
  if (dynamicFilter && !isSearchWildCardAll) {
    filtered = await dynamicFilterPatternFly.memo(coercedSearchQuery, updatedFilters, searchResultsFilterMap);
  } else {
    filtered = await filterPatternFly(updatedFilters, searchResultsFilterMap);
  }

  const { byResource } = filtered;

  // Loop fuzzy results, apply and update search results with resources.
  for (const [name, fuzzyMatch] of fuzzyResultsMap) {
    const filteredData = byResource.get(name);

    if (!filteredData) {
      continue;
    }

    searchResultsMap.set(name, {
      ...fuzzyMatch,
      ...filteredData,
      query: coercedSearchQuery
    } as SearchPatternFlyResult);
  }

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
    firstExactMatch: sortedExactMatches.find(match => match.name === coercedSearchQuery) || sortedExactMatches[0],
    exactMatches: sortedExactMatches.slice(0, maxResults),
    remainingMatches: (maxResults - exactMatches.length) < 0 ? [] : sortedRemainingMatches.slice(0, maxResults - exactMatches.length),
    searchResults: sortedSearchResults.slice(0, maxResults),
    totalResults: sortedSearchResults.length,
    totalPotentialMatches: search?.totalResults ?? updatedResources.keywordsIndex.length
  };
};

/**
 * Memoized version of searchPatternFly.
 */
searchPatternFly.memo = memo(searchPatternFly, DEFAULT_OPTIONS.toolMemoOptions.searchPatternFlyDocs);

export {
  dynamicFilterPatternFly,
  filterPatternFly,
  searchPatternFly,
  type FilterPatternFlyFilters,
  type FilterPatternFlyResults,
  type SearchPatternFlyResult,
  type SearchPatternFlyResults
};
