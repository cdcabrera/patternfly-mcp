import { fuzzySearch, type FuzzySearchResult } from './server.search';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
import {
  getPatternFlyMcpDocs,
  // getPatternFlyMcpResources,
  // getPatternFlyReactComponentNames,
  // type PatternFlyMcpDocEntry,
  type PatternFlyMcpResourceMetadata
} from './patternFly.getResources';

/**
 * Search result object returned by searchPatternFly, includes additional metadata and URLs.
 *
 * @interface SearchPatternFlyResult
 * @extends FuzzySearchResult
 *
 * @property doc - PatternFly documentation URL
 * @property {PatternFlyMcpDocEntry[]} docEntries - List of the associated documentation entries
 *     containing metadata and paths.
 * @property docUrls - List of associated documentation URLs
 * @property {PatternFlyMcpDocEntry[]} guidanceEntries - List of the associated agent guidance entries
 *     containing metadata and paths.
 * @property guidanceUrls - List of associated agent guidance URLs
 * @property isSchemasAvailable - Whether JSON schemas are available for the component
 * @property schema - JSON schema URL, if available
 * @property query - Associated search query string, `undefined` if no query was provided
 */
/* interface SearchPatternFlyResultExtended extends FuzzySearchResult {
  // doc: string;
  // docEntries: PatternFlyMcpDocEntry[];
  // docUrls: string[];
  // guidanceEntries: PatternFlyMcpDocEntry[];
  // guidanceUrls: string[];
  urls: string[];
  urlsNoGuidance: string[];
  urlsGuidance: string[];
  entriesGuidance: PatternFlyMcpDocEntry[];
  entriesNoGuidance: PatternFlyMcpDocEntry[];
  isSchemasAvailable: boolean;
  // schema: string | undefined;
  versions: Record<string, { uris: string[], urls: string[], urlsGuidance: string[], urlsNoGuidance: string[], entriesGuidance: unknown[], entriesNoGuidance: unknown[] }>;
  query: string | undefined;
}

 */

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
  firstExactMatch: (FuzzySearchResult & PatternFlyMcpResourceMetadata) | undefined,
  exactMatches: (FuzzySearchResult & PatternFlyMcpResourceMetadata)[],
  searchResults: (FuzzySearchResult & PatternFlyMcpResourceMetadata)[]
}

/**
 * Search results object returned by searchPatternFlyDocumentationPaths.
 * Includes additional metadata and URLs.
 *
 * @interface SearchPatternFlyResultsExtended
 * @extends SearchPatternFlyResults
 *
 * @property {SearchPatternFlyResult | undefined} extendedFirstExactMatch - First exact match within fuzzy
 *     search results
 * @property {SearchPatternFlyResult[]} extendedExactMatches - All exact matches within fuzzy search results
 * @property {SearchPatternFlyResult[]} extendedSearchResults - Fuzzy search results
 */
// interface SearchPatternFlyResultsExtended extends SearchPatternFlyResults {
  // extendedFirstExactMatch: SearchPatternFlyResultExtended | undefined,
  // extendedExactMatches: SearchPatternFlyResultExtended[],
  // extendedSearchResults: SearchPatternFlyResultExtended[]
// }

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
  // components = getPatternFlyReactComponentNames.memo(),
  documentation = getPatternFlyMcpDocs.memo(),
  // resources = getPatternFlyMcpResources.memo(),
  allowWildCardAll = false
} = {}) => {
  const updatedDocumentation = await documentation;
  // const updatedResources = await resources;
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

  const updatedSearchResults: (FuzzySearchResult & PatternFlyMcpResourceMetadata)[] = searchResults.map((result: FuzzySearchResult) => {
    const resource = updatedDocumentation.resources.get(result.item);

    return {
      ...result,
      ...resource,
      query: searchQuery
    };
  }) as (FuzzySearchResult & PatternFlyMcpResourceMetadata)[];

  /*
  const extendResults = (results: FuzzySearchResult[] = [], query?: string) => results.map(result => {
    const urls = updatedDocumentation.byNameWithPath[result.item] || [];
    const urlsNoGuidance = updatedDocumentation.byNameWithPathNoGuidance[result.item] || [];
    const urlsGuidance = updatedDocumentation.byNameWithPathGuidance[result.item] || [];

    const entriesNoGuidance = updatedDocumentation.byNameWithNoGuidance[result.item] || [];
    const entriesGuidance = updatedDocumentation.byNameWithGuidance[result.item] || [];
    const isSchemasAvailable = components.componentNamesWithSchema.includes(result.item);

    const versions: Record<string, {
      uris: string[],
      urls: string[],
      urlsGuidance: string[],
      urlsNoGuidance: string[],
      entriesGuidance: unknown[],
      entriesNoGuidance: unknown[]
    }> = {};

    Object.entries(updatedDocumentation.byVersionByNameWithPath).forEach(([version, names]) => {
      if (names[result.item]) {
        // @ts-expect-error ignore, nullish assignment
        versions[version] ??= {};
        // @ts-expect-error ignore, nullish assignment
        versions[version].uris ??= [];
        // @ts-expect-error ignore, nullish assignment
        versions[version].urls ??= [];

        // @ts-expect-error ignore, nullish assignment
        versions[version].uris.push(`patternfly://docs/${version}/${result.item}`);
        // @ts-expect-error ignore, nullish assignment
        versions[version].urls.push(...names[result.item] as string[]);
      }
    });

    Object.entries(updatedDocumentation.byVersionByNameWithPathGuidance).forEach(([version, names]) => {
      if (names[result.item]) {
        // @ts-expect-error ignore, nullish assignment
        versions[version] ??= {};
        // @ts-expect-error ignore, nullish assignment
        versions[version].urlsGuidance ??= [];
        // @ts-expect-error ignore, nullish assignment
        versions[version].urlsGuidance.push(...names[result.item] as string[]);
      }
    });

    Object.entries(updatedDocumentation.byVersionByNameWithPathNoGuidance).forEach(([version, names]) => {
      if (names[result.item]) {
        // @ts-expect-error ignore, nullish assignment
        versions[version] ??= {};
        // @ts-expect-error ignore, nullish assignment
        versions[version].urlsNoGuidance ??= [];
        // @ts-expect-error ignore, nullish assignment
        versions[version].urlsNoGuidance.push(...names[result.item] as string[]);
      }
    });

    Object.entries(updatedDocumentation.byVersionByNameGuidance).forEach(([version, names]) => {
      if (names[result.item]) {
        // @ts-expect-error ignore, nullish assignment
        versions[version] ??= {};
        // @ts-expect-error ignore, nullish assignment
        versions[version].entriesGuidance ??= [];
        // @ts-expect-error ignore, nullish assignment
        versions[version].entriesGuidance.push(...names[result.item] as string[]);
      }
    });

    Object.entries(updatedDocumentation.byVersionByNameNoGuidance).forEach(([version, names]) => {
      if (names[result.item]) {
        // @ts-expect-error ignore, nullish assignment
        versions[version] ??= {};
        // @ts-expect-error ignore, nullish assignment
        versions[version].entriesNoGuidance ??= [];
        // @ts-expect-error ignore, nullish assignment
        versions[version].entriesNoGuidance.push(...names[result.item] as string[]);
      }
    });

    return {
      ...result,
      urls,
      urlsNoGuidance,
      urlsGuidance,

      entriesNoGuidance,
      entriesGuidance,
      isSchemasAvailable,
      // schema: isSchemasAvailable ? `patternfly://schemas/${result.item}` : undefined,
      versions,
      query
    };
  });
  */

  const exactMatches = updatedSearchResults.filter(result => result.matchType === 'exact');
  // const extendedExactMatches: SearchPatternFlyResultExtended[] = extendResults(exactMatches, searchQuery);
  // const extendedSearchResults: SearchPatternFlyResultExtended[] = extendResults(searchResults, searchQuery);

  return {
    isSearchWildCardAll,
    firstExactMatch: exactMatches[0],
    exactMatches: exactMatches,
    searchResults: updatedSearchResults
    // extendedFirstExactMatch: exactMatches[0],
    // extendedExactMatches: exactMatches,
    // extendedSearchResults: searchResults
  };
};

/**
 * Memoized version of searchComponents.
 */
searchPatternFly.memo = memo(searchPatternFly, DEFAULT_OPTIONS.toolMemoOptions.searchPatternFlyDocs);

export {
  searchPatternFly,
  type SearchPatternFlyResults
  // type SearchPatternFlyResultsExtended,
  // type SearchPatternFlyResultExtended
};
