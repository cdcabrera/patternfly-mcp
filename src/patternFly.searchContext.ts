import {
  fuzzySearch
  // type FuzzySearch,
  // type FuzzySearchOptions,
  // type FuzzySearchResult,
  // type FuzzySearchResultMatchType
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
// import { type PatternFlyMcpDocsCatalogDoc } from './docs.embedded';

// type  = ContextManagementPatternFlyIdRecord | ContextManagementCollectionRecord;

/**
 * A filtered MCP resource.
 *
 * @note Filtered resources lose their redundant version reference Map from `getPatternFlyMcpResources`
 * to simplify filtering. This data is STILL available inside the resource metadata, but is
 * potentially unnecessary since filtering already handles "version."
 */
// type PatternFlyMcpResourceFilteredMetadata = Omit<PatternFlyMcpResourceMetadata, 'versions'>;

/**
 * Filters for specific properties of PatternFly data.
 *
 * @interface FilterPatternFlyFilters
 *
 * @property [version] - PatternFly version to filter search results. Defaults to undefined for all versions.
 * @property [category] - Category to filter search results. Defaults to undefined for all categories.
 * @property [section] - Section to filter search results. Defaults to undefined for all sections.
 * @property [name] - Name, or hash id, to filter search results. Defaults to undefined for all names and IDs.
 * @property [path] - Document path, or URI, to filter search results. Defaults to undefined for all paths and URIs.
 * @property [id] - Document ID to filter search results. Defaults to undefined for all IDs and URIs.
 */
interface FilterPatternFlyFiltersContext {
  version?: string | undefined;
  category?: string | undefined;
  section?: string | undefined;
  name?: string | undefined;
  id?: string | undefined;
  collectionId?: string | undefined;
  seriesName?: string | undefined;
}

/**
 * Search results object returned by searchPatternFly.
 * Includes additional metadata and URLs.
 *
 * @interface SearchPatternFlyResults
 *
 * @property isSearchWildCardAll - Whether the search query matched all components
 * @property {SearchPatternFlyResult | undefined} firstExactMatch - `@deprecated Unreliable when the query is a hash, URI, or
 *     path (compares name to the query string). Prefer exactMatches[0] or searchResults`.
 * @property {SearchPatternFlyResult[]} exactMatches - Exact matches within search results
 * @property {SearchPatternFlyResult[]} remainingMatches - Contrast to `exactMatches`, the remaining matches within search results
 * @property {SearchPatternFlyResult[]} searchResults - All search results, exact and remaining matches
 * @property totalPotentialMatches - Total number of available PatternFly keywords to match on, what was possible before narrowing.
 * @property totalResults - Total number of actual resources that meet all criteria.
 */
/*
interface SearchPatternFlyResults {
  isSearchWildCardAll: boolean;
  // @deprecated Use exactMatches[0] or searchResults
  firstExactMatch: SearchPatternFlyResult | undefined;
  exactMatches: SearchPatternFlyResult[];
  remainingMatches: SearchPatternFlyResult[];
  searchResults: SearchPatternFlyResult[];
  totalPotentialMatches: number;
  totalResults: number;
}
(/)

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
    // Do we even need "path" here we don't allow filtering from the regular filter for that? Path was what's there before we process docs.json.
    searchFilters = ['id', 'name', 'path'],
    maxResultsLimit = 1
  }: { searchFilters?: (keyof FilterPatternFlyFilters)[]; maxResultsLimit?: number } = {}
): Promise<Map<string, ContextManagementPatternFlyHashRecord>> => {
  const query = searchQuery.trim().toLowerCase();

  if (!query) {
    return new Map();
  }

  const abortController = new AbortController();
  const { signal } = abortController;

  // Run match and handle abort
  const passFail = (promise: Promise<Map<string, ContextManagementPatternFlyHashRecord>>) =>
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

  try {
    return await Promise.any(
      searchFilters.map(filter => passFail(filterPatternFlyContext({ ...filters, [filter]: query }, resources, settings)))
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
const filterPatternFlyContext = async (
  filters: FilterPatternFlyFilters | undefined,
  mcpResources?: FilterPatternFlyMcpResources,
  { maxSyncTime = 25, signal, signalError }: FilterPatternFlySettings = {}
): Promise<Map<string, ContextManagementPatternFlyHashRecord>> => {
  const getResources = await (mcpResources || getPatternFlyContextManagementResources.memo());
  const resources = getResources as ContextManagementResources;
  const hashIndex = resources.idIndex;
  const startTime = (signal && performance.now()) || undefined;

  if (!filters || Object.keys(filters).length === 0) {
    return hashIndex;
  }

  const results = new Map<string, ContextManagementPatternFlyHashRecord>();

  // Fallback: O(N) filtering on the flattened index
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

  // these should be generated
  const isMatch = (record: ContextManagementPatternFlyHashRecord) => {
    const matchesVersion = !normalizedFilters.version || record.version.toLowerCase() === normalizedFilters.version;
    const matchesCategory = !normalizedFilters.category ||
      filterMatch(record.category, normalizedFilters.category) ||
      filterMatch(record.displayCategory, normalizedFilters.category);
    const matchesSection = !normalizedFilters.section || filterMatch(record.section, normalizedFilters.section);
    const matchesName = !normalizedFilters.name ||
      filterMatch(record.name, normalizedFilters.name) ||
      filterMatch(record.displayName, normalizedFilters.name) ||
      filterMatch(record.id, normalizedFilters.name);
    const matchesPath = !normalizedFilters.path || filterMatch(record.path, normalizedFilters.path);

    return matchesVersion && matchesCategory && matchesSection && matchesName && matchesPath;
  };

  // Fast-path: O(1) lookup if id is provided
  if (filters.id) {
    const record = hashIndex.get(filters.id.toLowerCase());

    if (record && isMatch(record)) {
      results.set(record.id, record);

      return results;
    }
  }

  // Fast-path: O(V) lookup if name is provided
  if (filters.name) {
    const ids = resources.nameIndex.get(filters.name.toLowerCase());

    if (ids) {
      for (const id of ids) {
        const record = hashIndex.get(id);

        if (record && isMatch(record)) {
          results.set(record.id, record);
        }
      }

      // If we have any results from the name lookup, return them immediately
      // This is O(V) where V is the number of versions for a name.
      if (results.size > 0) {
        return results;
      }
    }
  }

  // Fast-path: O(1) lookup if path is provided
  if (filters.path) {
    const id = resources.pathIndex.get(filters.path.toLowerCase());

    if (id) {
      const record = hashIndex.get(id);

      if (record && isMatch(record)) {
        results.set(record.id, record);

        return results;
      }
    }
  }

  const isBlocking = (i: number) =>
    signal && startTime && (i % 200 === 0) && (performance.now() - startTime > maxSyncTime);

  let index = 0;

  for (const record of hashIndex.values()) {
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
  let filteredRecords: Map<string, ContextManagementPatternFlyHashRecord>;

  if (dynamicFilter && !isSearchAll) {
    const dynamicResults = await dynamicFilterPatternFlyContext.memo(query, filters, resources);

    // If dynamic filter found exactly one high-confidence result, return it as an exact match
    if (dynamicResults.size === 1) {
      const record = dynamicResults.values().next().value as ContextManagementPatternFlyHashRecord;
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
  const search = new Map<string, ContextManagementPatternFlyIdRecord | ContextManagementCollectionRecord>();

  [...filteredRecords.values(), ...resources.collectionsIndex.values()].forEach(record => {
    search.set(record.searchString, record);
  });

  const { results: fuzzyResults } = fuzzySearch(query, [...search.keys()], {
    maxDistance,
    maxResults
  });

  const finalResults: SearchPatternFlyContextResult[] = fuzzyResults.map(res => {
    const item = search.get(res.item);

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
  type SearchPatternFlyContextResults
};
