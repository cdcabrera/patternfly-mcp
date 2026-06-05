import {
  fuzzySearch,
  // type FuzzySearch,
  // type FuzzySearchOptions,
  // type FuzzySearchResult,
  type FuzzySearchResultMatchType
} from './server.search';
import { memo } from './server.caching';
import { generateHash } from './server.helpers';
import { DEFAULT_OPTIONS } from './options.defaults';
import {
  // getPatternFlyMcpResources,
  getPatternFlyContextManagementResources,
  // type PatternFlyMcpAvailableResources,
  type ContextManagementResources,
  type ContextManagementCollectionRecord,
  // type PatternFlyMcpDocsMeta,
  // type PatternFlyMcpResourceMetadata,
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
 */
interface FilterPatternFlyFilters {
  version?: string;
  category?: string;
  section?: string;
  name?: string;
  id?: string;
  collectionId?: string;
  seriesName?: string;
}

/**
 * Optimized dynamic filter for context management.
 *
 * @param searchQuery - The search query.
 * @param filters - Filters to apply.
 * @param resources - Context management resources.
 * @param [options] - Optional settings object.
 * @param [options.searchFilters] - List of filter keys to try in parallel.
 * @param [options.maxResultsLimit] - Maximum results limit for the dynamic filter pass.
 * @returns Map of ID to Record.
 */
const dynamicFilterPatternFlyContext = async (
  searchQuery: string,
  filters: FilterPatternFlyFilters | undefined,
  resources: ContextManagementResources,
  {
    searchFilters = ['id', 'name', 'seriesName', 'collectionId'],
    maxResultsLimit = 1
  }: { searchFilters?: (keyof FilterPatternFlyFilters)[]; maxResultsLimit?: number } = {}
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

  const settings = {
    signal,
    signalError: new DOMException('Filter operation aborted', 'AbortError')
  };

  // Parallel pass over optimized indexes
  try {
    return await Promise.any(
      searchFilters.map(filter =>
        passFail(filterPatternFlyContext({ ...filters, [filter]: query }, resources, settings)))
    );
  } catch {
    return new Map();
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
/**
 * Optimized filtering for context management.
 *
 * @param filters - Filters to apply.
 * @param [mcpResources] - PatternFly resources.
 * @param [settings] - Optional FilterPatternFlySettings.
 * @param settings.maxSyncTime
 * @param settings.signal
 * @param settings.signalError
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
    const matchesVersion = !normalizedFilters.version || filterMatch(record.version, normalizedFilters.version);
    const matchesCategory = !normalizedFilters.category || filterMatch(record.category, normalizedFilters.category) ||
      filterMatch(record.displayCategory, normalizedFilters.category);
    const matchesSection = !normalizedFilters.section || filterMatch(record.section, normalizedFilters.section);
    const matchesName = !normalizedFilters.name || filterMatch(record.name, normalizedFilters.name) ||
      filterMatch(record.displayName, normalizedFilters.name);
    const matchesId = !normalizedFilters.id || filterMatch(record.id, normalizedFilters.id);
    const collectionId = !normalizedFilters.collectionId || record.collectionIds.includes(normalizedFilters.collectionId);
    const matchesSeriesName = !normalizedFilters.seriesName || filterMatch(record.seriesName, normalizedFilters.seriesName);

    return matchesVersion && matchesCategory && matchesSection && matchesName && matchesId && collectionId && matchesSeriesName;
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
      collectionRecords.forEach(record => {
        if (isMatch(record)) {
          results.set(record.id, record);
        }
      });

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
      ids.forEach(id => {
        const record = idIndex.get(id);

        if (record && isMatch(record)) {
          results.set(record.id, record);
        }
      });

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

    if (filtered.has(exactMatch.id)) {
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

    if (dynamicResults.size > 0) {
      filteredRecords = dynamicResults;
    } else {
      filteredRecords = await filterPatternFlyContext.memo(filters, resources);
    }
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
  type FilterPatternFlyResults,
  type FilterPatternFlyResultsEntry,
  type FilterPatternFlyResultsResource,
  type FilterPatternFlySettings,
  type SearchPatternFlyResult,
  type SearchPatternFlyResults,
  type SearchPatternFlyContextResult,
  type SearchPatternFlyContextResults,
  type SearchPatternFlyContextResultsRecord
};
