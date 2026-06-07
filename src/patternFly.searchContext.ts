import {
  fuzzySearch,
  type FuzzySearchResultMatchType
} from './server.search';
import { memo } from './server.caching';
import { generateHash } from './server.helpers';
import { DEFAULT_OPTIONS } from './options.defaults';
import {
  getPatternFlyContextManagementResources,
  type ContextManagementResources,
  type ContextManagementCollectionRecord,
  type ContextManagementPatternFlyIdRecord
} from './patternFly.getResourcesContext';

/**
 * Union for search record flexibility.
 */
type SearchPatternFlyContextResultsRecord = ContextManagementPatternFlyIdRecord | ContextManagementCollectionRecord;

/**
 * A single search result match for context management.
 *
 * @interface SearchPatternFlyContextResult
 *
 * @property id - The unique ID (SHA-1 hash) of the record or collection.
 * @property matchType - The type of match found (exact, prefix, fuzzy, all, etc.).
 * @property distance - The edit distance for fuzzy matches (0 for exact).
 * @property record - The actual record (Doc) or collection (Hub) object.
 * @property uri - The standardized MCP resource URI.
 */
interface SearchPatternFlyContextResult {
  id: string;
  matchType: FuzzySearchResultMatchType;
  distance: number;
  record: SearchPatternFlyContextResultsRecord;
  uri: string;
}

/**
 * The collection of results returned by searchPatternFlyContext.
 *
 * @interface SearchPatternFlyContextResults
 *
 * @property exactMatches - Results that are high-confidence exact matches.
 * @property remainingMatches - Results that are fuzzy or partial matches.
 * @property searchResults - The combined list of all matches.
 */
interface SearchPatternFlyContextResults {
  exactMatches: SearchPatternFlyContextResult[];
  remainingMatches: SearchPatternFlyContextResult[];
  searchResults: SearchPatternFlyContextResult[];
}

/**
 * Options for the searchPatternFlyContext function.
 *
 * @interface SearchPatternFlyOptions
 *
 * @property [mcpResources] - Optional preloaded or pre-memoized PatternFly resources.
 * @property [allowWildCardAll] - Whether to allow '*' or 'all' to return all filtered results.
 * @property [dynamicFilter] - Whether to use parallel dynamic filtering for tighter matching.
 * @property [maxDistance] - Maximum edit distance allowed for fuzzy search.
 * @property [maxResults] - Maximum number of results to return.
 */
interface SearchPatternFlyOptions {
  mcpResources?: Promise<ContextManagementResources> | ContextManagementResources;
  allowWildCardAll?: boolean;
  dynamicFilter?: boolean;
  maxDistance?: number;
  maxResults?: number;
}

/**
 * Filtering and manage PatternFly MCP resources.
 *
 * Allows handling resources as
 * - a `Promise` that resolves to `PatternFlyMcpAvailableResources`
 *    - Use the `Promise` when the resources are retrieved asynchronously and require processing upon resolution.
 * - a `Map` instance where the key is a string and the value is `PatternFlyMcpResourceFilteredMetadata`.
 *    - Use the `Map` when the resources are already available and stored in key-value pairs for quick access.
 *
 */
type FilterPatternFlyMcpResources = Promise<ContextManagementResources> | ContextManagementResources;

/**
 * Used for configuring the `filterPatternFly.memo`.
 *
 * @property {FilterPatternFlyFilters} 0 The filters to be applied, which specify the behavior or conditions for the memoized functionality.
 * @property {FilterPatternFlyMcpResources} [1] Optional MCP resources configuration to be utilized during memo execution.
 * @property {FilterPatternFlySettings} [2] Optional settings that influence runtime behavior or processing settings.
 */
type FilterPatternFlyMemoArgs = [
  filters: FilterPatternFlyFilters | undefined,
  mcpResources?: FilterPatternFlyMcpResources | undefined,
  settings?: FilterPatternFlySettings | undefined
];

/**
 * Settings for the filterPatternFlyContext function.
 *
 * @interface FilterPatternFlySettings
 *
 * @property [maxSyncTime] - Max synchronous time (ms) before yielding to the event loop.
 * @property [signal] - Abort signal to cancel a long-running search.
 * @property [signalError] - Error to throw when the search is aborted.
 */
interface FilterPatternFlySettings {
  maxSyncTime?: number;
  signal?: AbortSignal;
  signalError?: Error | DOMException;
}

/**
 * Filters for narrowing down PatternFly resource searches.
 *
 * @interface FilterPatternFlyFilters
 *
 * @property [version] - The version of the resource to filter by.
 * @property [category] - The category of the resource to filter by.
 * @property [section] - The section of the resource to filter by.
 * @property [name] - The name of the resource to filter by.
 * @property [id] - The ID of the resource to filter by.
 * @property [collectionId] - The ID of the collection to filter by.
 * @property [seriesName] - The base series name of the resource to filter by.
 * @property [recordType] - The type of the resource to filter by.
 */
interface FilterPatternFlyFilters {
  version?: string;
  category?: string;
  section?: string;
  name?: string;
  id?: string;
  collectionId?: string;
  seriesName?: string;
  recordType?: string;
}

/**
 * Filter keys tried in parallel by {@link dynamicFilterPatternFly}. Order is priority
 * (e.g. `name` first for hash/entry id and URI narrowing). Do not randomize — truncation
 * and `Promise.any` both keep this sequence; reorder only with intentional product priority.
 */
const SEARCH_FILTERS: (keyof FilterPatternFlyFilters)[] = ['id', 'name', 'seriesName', 'collectionId'];

/**
 * Max parallel dynamic-filter passes (excluding the always-included base pass). Matches
 * {@link SEARCH_FILTERS} length; longer custom `searchFilters` arrays are truncated from the
 * front so priority order is preserved. Do not randomize the slice.
 */
const MAX_DYNAMIC_FILTER_PASSES = SEARCH_FILTERS.length;

/**
 * Optimized dynamic filter for context management.
 *
 * @param searchQuery - The search query.
 * @param filters - Filters to apply.
 * @param resources - Context management resources.
 * @param [options] - Optional settings object.
 * @param [options.searchFilters] - Array of filters to search typically from {@link filterPatternFly}. Defaults to {@link SEARCH_FILTERS}.
 * @param [options.maxFilterPasses] - Max number of parallel filter passes. Defaults to {@link MAX_DYNAMIC_FILTER_PASSES}.
 * @param [options.maxResultsLimit] - Max number of results internal conditions need to match before they return the original result. Defaults to `1`.
 * @param [options.useExistingFilters] - Use the existing filters or bypass them. Defaults to `true`.
 * @returns Map of ID to Record.
 */
const dynamicFilterPatternFlyContext = async (
  searchQuery: string,
  filters: FilterPatternFlyFilters | undefined,
  resources: ContextManagementResources,
  {
    searchFilters = SEARCH_FILTERS,
    maxFilterPasses = MAX_DYNAMIC_FILTER_PASSES,
    maxResultsLimit = 1,
    useExistingFilters = true
  }: { searchFilters?: (keyof FilterPatternFlyFilters)[]; maxFilterPasses?: number; maxResultsLimit?: number; useExistingFilters?: boolean } = {}
): Promise<Map<string, ContextManagementPatternFlyIdRecord>> => {
  const query = searchQuery.trim().toLowerCase();

  if (!query) {
    return new Map();
  }

  const abortController = new AbortController();
  const { signal } = abortController;

  // Run match and handle abort
  const passFail = (promise: Promise<Map<string, ContextManagementPatternFlyIdRecord>>) =>
    promise.then(output => {
      if (signal.aborted || output.size !== maxResultsLimit) {
        throw new Error('Dynamic filter pass did not match maxResultsLimit');
      }

      abortController.abort();

      return output;
    }).catch((err: unknown) => {
      if (signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
        throw new Error('Dynamic filter pass did not match maxResultsLimit');
      }

      throw err;
    });

  const filtersToTry = searchFilters
    .filter(filter => !(useExistingFilters && filters && filters[filter]))
    .slice(0, maxFilterPasses);

  const settings = {
    signal,
    signalError: new DOMException('Filter operation aborted', 'AbortError')
  };

  // Parallel pass over optimized indexes
  try {
    return await Promise.any([
      ...filtersToTry.map(filter =>
        passFail(filterPatternFlyContext({ ...filters, [filter]: query }, resources, settings))),
      passFail(filterPatternFlyContext(filters, resources, settings))
    ]);
  } catch {
    // return new Map();
    return filterPatternFlyContext(filters, resources);
  } finally {
    abortController.abort();
  }
};

/**
 * Memoized version of dynamicFilterPatternFlyContext
 *
 * @note `cacheErrors: false` so a rejected fallback doesn't stick. This aligns with
 * {@link filterPatternFly.memo}. Parallel pass poison is avoided by calling bare
 * {@link filterPatternFly} inside the race, not by this outer memo setting alone.
 */
dynamicFilterPatternFlyContext.memo = memo(dynamicFilterPatternFlyContext, {
  ...DEFAULT_OPTIONS.resourceMemoOptions.default,
  cacheErrors: false
});

/**
 * Optimized filtering for context management.
 *
 * @param filters - Filters to apply.
 * @param [mcpResources] - PatternFly resources.
 * @param [settings] - Optional {@link FilterPatternFlySettings}.
 * @param [settings.maxSyncTime] - Max synchronous time slice in milliseconds before yielding.
 * @param [settings.signal] - Abort signal.
 * @param [settings.signalError] - Error to throw when aborted.
 * @returns Map of ID to Record.
 */
const filterPatternFlyContext = async (
  filters: FilterPatternFlyFilters | undefined,
  mcpResources?: FilterPatternFlyMcpResources,
  { maxSyncTime = 25, signal, signalError }: FilterPatternFlySettings = {}
): Promise<Map<string, ContextManagementPatternFlyIdRecord>> => {
  const getResources = await (mcpResources || getPatternFlyContextManagementResources.memo());
  const resources = getResources as ContextManagementResources;
  const idIndex = resources.idIndex;
  const startTime = (signal && performance.now()) || undefined;

  if (!filters || Object.keys(filters).length === 0) {
    return idIndex;
  }

  const results = new Map<string, ContextManagementPatternFlyIdRecord>();

  // Normalize filters to lowercase for consistent matching
  const normalizedFilters = Object.fromEntries(
    Object.entries(filters)
      .filter(([_key, value]) => (typeof value === 'string' || typeof value === 'number') && String(value).trim().length > 0)
      .map(([key, value]) => [key, String(value).trim().toLowerCase()])
  );

  const filterMatch = (propertyValue: unknown, filterValue: string) => {
    const normalizePropertyValue = String(propertyValue).trim().toLowerCase();

    return normalizePropertyValue === filterValue ||
      normalizePropertyValue.startsWith(filterValue) ||
      normalizePropertyValue.endsWith(filterValue);
  };

  /**
   * Generalized matching logic that checks all provided filters against record properties.
   *
   * @param record
   */
  const isMatch = (record: ContextManagementPatternFlyIdRecord) => {
    if (signal?.aborted) {
      if (signalError) {
        throw signalError;
      }

      return false;
    }

    const matchesVersion = !normalizedFilters.version || filterMatch(record.version, normalizedFilters.version);
    const matchesCategory = !normalizedFilters.category || filterMatch(record.category, normalizedFilters.category) ||
      filterMatch(record.displayCategory, normalizedFilters.category);
    const matchesSection = !normalizedFilters.section || filterMatch(record.section, normalizedFilters.section);
    const matchesName = !normalizedFilters.name || filterMatch(record.name, normalizedFilters.name) ||
      filterMatch(record.displayName, normalizedFilters.name);
    const matchesId = !normalizedFilters.id || filterMatch(record.id, normalizedFilters.id);
    const matchesCollectionId = !normalizedFilters.collectionId || record.collectionIds.includes(normalizedFilters.collectionId);
    const matchesSeriesName = !normalizedFilters.seriesName || filterMatch(record.seriesName, normalizedFilters.seriesName);
    const matchesRecordType = !normalizedFilters.recordType || filterMatch(record.recordType, normalizedFilters.recordType);

    return matchesVersion && matchesCategory && matchesSection && matchesName && matchesId && matchesCollectionId && matchesSeriesName && matchesRecordType;
  };

  // 1. ID Lookup: O(1).
  if (normalizedFilters.id) {
    const record = idIndex.get(normalizedFilters.id);

    if (record && isMatch(record)) {
      results.set(record.id, record);

      return results;
    }
  }

  // 2. Collection ID Lookup: O(K) where K is collection size.
  if (normalizedFilters.collectionId) {
    const collectionRecords = resources.collectionsIdIndex.get(normalizedFilters.collectionId);

    if (collectionRecords) {
      for (const record of collectionRecords) {
        if (signal?.aborted) {
          if (signalError) {
            throw signalError;
          }

          break;
        }

        if (isMatch(record)) {
          results.set(record.id, record);
        }
      }

      if (results.size > 0) {
        return results;
      }
    }
  }

  // 3. Name or SeriesName Lookup: O(V) where V is versions count
  const nameToTry = normalizedFilters.name || normalizedFilters.seriesName;

  if (nameToTry) {
    const ids = resources.nameIndex.get(nameToTry);

    if (ids) {
      for (const id of ids) {
        if (signal?.aborted) {
          if (signalError) {
            throw signalError;
          }

          break;
        }

        const record = idIndex.get(id);

        if (record && isMatch(record)) {
          results.set(record.id, record);
        }
      }

      if (results.size > 0) {
        return results;
      }
    }
  }

  // 4. FALLBACK: O(N) with Time-Slicing
  const isBlocking = (i: number) =>
    signal && startTime && (i % 200 === 0) && (performance.now() - startTime > maxSyncTime);

  let index = 0;

  for (const record of idIndex.values()) {
    if (isBlocking(index)) {
      await new Promise(resolve => setImmediate(resolve));
    }

    index += 1;

    if (signal?.aborted) {
      if (signalError) {
        throw signalError;
      }

      break;
    }

    if (isMatch(record)) {
      results.set(record.id, record);
    }
  }

  return results;
};

/**
 * Memoized version of filterPatternFlyContext.
 */
filterPatternFlyContext.memo = memo(filterPatternFlyContext, {
  ...DEFAULT_OPTIONS.resourceMemoOptions.default,
  cacheErrors: false,
  keyHash: (args: Readonly<FilterPatternFlyMemoArgs>) => {
    const [filters, resources] = args;

    return generateHash([filters, resources]);
  }
});

/**
 * Specialized search for context management.
 *
 * @param searchQuery - The search query.
 * @param filters - Filters to apply.
 * @param options - Search options.
 * @param [options.mcpResources] - PatternFly resources.
 * @param [options.allowWildCardAll] - Whether to allow wild card all search.
 * @param [options.dynamicFilter] - Whether to allow dynamic filtering.
 * @param [options.maxDistance] - Maximum distance for fuzzy search.
 * @param [options.maxResults] - Maximum results for fuzzy search.
 * @returns Search results.
 */
const searchPatternFlyContext = async (
  searchQuery: string,
  filters: FilterPatternFlyFilters | undefined,
  { mcpResources, allowWildCardAll = false, dynamicFilter = true, maxDistance = 3, maxResults = 10 }: SearchPatternFlyOptions = {}
): Promise<SearchPatternFlyContextResults> => {
  const query = searchQuery.trim().toLowerCase();
  const isSearchAll = allowWildCardAll && (query === '*' || query === 'all' || query === '');
  const getResources = await (mcpResources || getPatternFlyContextManagementResources.memo());
  const resources = getResources as ContextManagementResources;

  const exactRecord = resources.idIndex.get(query);
  const exactCollection = resources.collectionsIndex.get(query);
  const exactMatch = exactRecord || exactCollection;

  if (exactMatch) {
    const filtered = await filterPatternFlyContext(filters, resources);

    if (exactMatch.recordType === 'collection' || filtered.has(exactMatch.id)) {
      const result: SearchPatternFlyContextResult = {
        id: exactMatch.id,
        matchType: 'exact',
        distance: 0,
        record: exactMatch,
        uri: exactMatch.uri
      };

      return { exactMatches: [result], remainingMatches: [], searchResults: [result] };
    }
  }

  // 2. Parallel / Dynamic Filtering Pass
  let filteredRecords: Map<string, SearchPatternFlyContextResultsRecord>;

  if (dynamicFilter && !isSearchAll) {
    const dynamicResults = await dynamicFilterPatternFlyContext.memo(query, filters, resources);

    // If dynamic filter found exactly one high-confidence result, return it as an exact match
    if (dynamicResults.size === 1) {
      const record = dynamicResults.values().next().value as SearchPatternFlyContextResultsRecord;
      const result: SearchPatternFlyContextResult = {
        id: record.id,
        matchType: 'exact',
        distance: 0,
        record,
        uri: record.uri
      };

      return { exactMatches: [result], remainingMatches: [], searchResults: [result] };
    }

    filteredRecords = dynamicResults;
  } else {
    filteredRecords = await filterPatternFlyContext.memo(filters, resources);
  }

  // 3. Search ALL Pass
  if (isSearchAll) {
    const allResults: SearchPatternFlyContextResult[] = Array.from(filteredRecords.values()).map(record => ({
      id: record.id,
      matchType: 'all',
      distance: 0,
      record,
      uri: record.uri
    }));

    return {
      exactMatches: allResults,
      remainingMatches: [],
      searchResults: allResults.slice(0, maxResults)
    };
  }

  // 4. Fuzzy Search through Records + Collections
  const search = new Map<string, SearchPatternFlyContextResultsRecord>();

  [...filteredRecords.values(), ...resources.collectionsIndex.values()].forEach(record => {
    search.set(record.searchString, record);
  });

  const { results: fuzzyResults } = fuzzySearch(query, [...search.keys()], {
    maxDistance,
    maxResults
  });

  const finalResults: SearchPatternFlyContextResult[] = fuzzyResults.map(res => {
    const item = search.get(res.item) as SearchPatternFlyContextResultsRecord;

    return {
      id: item.id,
      matchType: res.matchType,
      distance: res.distance,
      record: item,
      uri: item.uri
    };
  });

  return {
    exactMatches: finalResults.filter(result => result.matchType === 'exact' || result.matchType === 'all'),
    remainingMatches: finalResults.filter(result => result.matchType !== 'exact' && result.matchType !== 'all'),
    searchResults: finalResults
  };
};

/**
 * Memoized version of searchPatternFlyContext.
 */
searchPatternFlyContext.memo = memo(searchPatternFlyContext);

export {
  dynamicFilterPatternFlyContext,
  filterPatternFlyContext,
  searchPatternFlyContext,
  type FilterPatternFlyFilters,
  type FilterPatternFlyMemoArgs,
  type FilterPatternFlyMcpResources,
  type FilterPatternFlySettings,
  type SearchPatternFlyContextResult,
  type SearchPatternFlyContextResults,
  type SearchPatternFlyContextResultsRecord
};
