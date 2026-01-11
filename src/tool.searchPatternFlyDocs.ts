import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentNames as pfComponentNames } from '@patternfly/patternfly-component-schemas/json';
import { type McpTool } from './server';
import { COMPONENT_DOCS } from './docs.component';
import { LAYOUT_DOCS } from './docs.layout';
import { CHART_DOCS } from './docs.chart';
import { getLocalDocs } from './docs.local';
import { fuzzySearch, type FuzzySearchResult } from './server.search';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';

/**
 * List of component names to include in search results.
 *
 * @note The "table" component is manually added to the list because it's not currently included
 * in the component schemas package.
 */
const componentNames = [...pfComponentNames, 'Table'].sort((a, b) => a.localeCompare(b));

/**
 * Extract a component name from a documentation URL string
 *
 * @note This is reliant on the documentation URLs being in the accepted format.
 * If the format changes, this will need to be updated.
 *
 * @example
 * extractComponentName('[@patternfly/ComponentName - Type](URL)');
 *
 * @param docUrl - Documentation URL string
 * @returns ComponentName or `null` if not found
 */
const extractComponentName = (docUrl: string): string | null => {
  const match = docUrl.match(/\[@patternfly\/([^\s-]+)/);

  return match && match[1] ? match[1] : null;
};

/**
 * Extract a URL from a Markdown link
 *
 * @example
 * extractUrl('[text](URL)');
 *
 * @param docUrl
 * @returns URL or original string if not a Markdown link
 */
const extractUrl = (docUrl: string): string => {
  const match = docUrl.match(/]\(([^)]+)\)/);

  return match && match[1] ? match[1] : docUrl;
};

/**
 * Build a map of component names relative to documentation URLs.
 *
 * @returns Map of component name -> array of URLs (Design Guidelines + Accessibility)
 */
const setComponentToDocsMap = () => {
  const map = new Map<string, string[]>();
  const allDocs = [...COMPONENT_DOCS, ...LAYOUT_DOCS, ...CHART_DOCS, ...getLocalDocs()];
  const getKey = (value?: string | undefined) => {
    if (!value) {
      return undefined;
    }

    for (const [key, urls] of map) {
      if (urls.includes(value)) {
        return key;
      } else {
        const results = fuzzySearch(value, urls, {
          deduplicateByNormalized: true
        });

        if (results.length) {
          return key;
        }
      }
    }

    return undefined;
  };

  for (const docUrl of allDocs) {
    const componentName = extractComponentName(docUrl);

    if (componentName) {
      const url = extractUrl(docUrl);
      const existing = map.get(componentName) || [];

      map.set(componentName, [...existing, url]);
    }
  }

  return {
    map,
    getKey
  };
};

/**
 * Memoized version of componentToDocsMap.
 */
setComponentToDocsMap.memo = memo(setComponentToDocsMap);

/**
 * Search for PatternFly component documentation URLs using fuzzy search.
 *
 * @param searchQuery - Search query string
 * @param names - List of names to search. Defaults to all component names.
 * @returns Object containing search results and matched URLs
 *   - `exactMatch`: An exact match within fuzzy search results
 *   - `searchResults`: Fuzzy search results
 *   - `matchedUrls`: List of unique matched URLs
 */
const searchComponents = (searchQuery: string, names = componentNames) => {
  const { map: componentToDocsMap } = setComponentToDocsMap.memo();

  // Use fuzzy search to handle exact matches and variations
  const searchResults = fuzzySearch(searchQuery, names, {
    maxDistance: 3,
    maxResults: 10,
    isFuzzyMatch: true,
    deduplicateByNormalized: true
  });

  const extendResults = (results: FuzzySearchResult[] = []) => results.map(result => {
    const urls = componentToDocsMap.get(result.item) || [];
    const matchedUrls = new Set<string>();

    urls.forEach(url => {
      matchedUrls.add(url);
    });

    return {
      ...result,
      urls: Array.from(matchedUrls),
      doc: `patternfly://docs/${result.item}`,
      schema: pfComponentNames.includes(result.item) ? `patternfly://schemas/${result.item}` : undefined
    };
  });

  const exactMatch = searchResults.find(result => result.matchType === 'exact');
  const [extendedExactMatch] = extendResults(exactMatch ? [exactMatch] : []);
  const extendedSearchResults = extendResults(searchResults);

  return {
    exactMatch: extendedExactMatch,
    searchResults: extendedSearchResults
  };
};

/**
 * Memoized version of searchComponents.
 */
searchComponents.memo = memo(searchComponents, DEFAULT_OPTIONS.toolMemoOptions.searchPatternFlyDocs);

/**
 * searchPatternFlyDocs tool function
 *
 * Searches for PatternFly component documentation URLs using fuzzy search.
 * Returns URLs only (does not fetch content). Use usePatternFlyDocs to fetch the actual content.
 *
 * @returns MCP tool tuple [name, schema, callback]
 */
const searchPatternFlyDocsTool = (): McpTool => {
  const callback = async (args: any = {}) => {
    const { searchQuery } = args;

    if (!searchQuery || typeof searchQuery !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: searchQuery must be a string: ${searchQuery}`
      );
    }

    const { searchResults } = searchComponents.memo(searchQuery);

    if (searchResults.length === 0) {
      return {
        content: [{
          type: 'text',
          text: [
            `No PatternFly documentation found matching "${searchQuery}"`,
            '',
            '---',
            '',
            '**Important**:',
            '  - To browse all available documentation, read the "patternfly://docs/index" resource.',
            '  - To browse all available components, read the "patternfly://schemas/index" resource.'
          ].join('\n')
        }]
      };
    }

    const results = searchResults.map(result => {
      const urlList = result.urls.map((url: string, index: number) => `  ${index + 1}. ${url}`).join('\n');
      const docRef = result.doc ? `  - ${result.doc}` : undefined;
      const schemaRef = result.schema ? `  - ${result.schema}` : undefined;
      let resources;

      if (docRef || schemaRef) {
        resources = [
          `### Resources`,
          docRef,
          schemaRef
        ].filter(Boolean).join('\n');
      }

      return [
        `## ${result.item}`,
        `**Match Type**: ${result.matchType}`,
        `### "usePatternFlyDocs" tool documentation URLs`,
        urlList.length ? urlList : '  - No URLs found',
        resources
      ].filter(Boolean).join('\n');
    });

    return {
      content: [{
        type: 'text',
        text: [
          `# Search results for "${searchQuery}"`,
          ...results,
          '',
          '---',
          '',
          '**Important**:',
          '  - Use the "usePatternFlyDocs" tool with the above URLs to fetch documentation content.',
          '  - To browse all available documentation, read the "patternfly://docs/index" resource.',
          '  - To browse all available components, read the "patternfly://schemas/index" resource.'
        ].join('\n')
      }]
    };
  };

  return [
    'searchPatternFlyDocs',
    {
      description: 'Search for PatternFly component documentation URLs and resource links. Accepts partial strings. Returns URLs and resource links only. Use "usePatternFlyDocs" to fetch the actual documentation.',
      inputSchema: {
        searchQuery: z.string().describe('Component name to search for (e.g., "button", "table")')
      }
    },
    callback
  ];
};

searchPatternFlyDocsTool.toolName = 'searchPatternFlyDocs';

export { searchPatternFlyDocsTool, searchComponents, setComponentToDocsMap, componentNames };
