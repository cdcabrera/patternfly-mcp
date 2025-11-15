import { join } from 'node:path';
import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentNames } from '@patternfly/patternfly-component-schemas/json';
import { type McpTool } from './server';
import { COMPONENT_DOCS } from './docs.component';
import { LAYOUT_DOCS } from './docs.layout';
import { CHART_DOCS } from './docs.chart';
import { getLocalDocs } from './docs.local';
import { getOptions } from './options.context';
import { processDocsFunction } from './server.getResources';
import { memo } from './server.caching';
import { fuzzySearch } from './server.search';

/**
 * Extract component name from a documentation URL string
 * Format: [@patternfly/ComponentName - Type](URL)
 * Returns: ComponentName or null if not found
 */
const extractComponentName = (docUrl: string): string | null => {
  const match = docUrl.match(/\[@patternfly\/([^\s-]+)/);
  return match && match[1] ? match[1] : null;
};

/**
 * Extract the actual URL from a markdown link
 * Format: [text](URL)
 * Returns: URL or original string if not a markdown link
 */
const extractUrl = (docUrl: string): string => {
  const match = docUrl.match(/\]\(([^)]+)\)/);
  return match && match[1] ? match[1] : docUrl;
};

/**
 * Map component names to their documentation URLs
 * Creates a map of component name -> array of URLs (Design Guidelines + Accessibility)
 */
const buildComponentToDocsMap = (): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  const allDocs = [...COMPONENT_DOCS, ...LAYOUT_DOCS, ...CHART_DOCS];

  for (const docUrl of allDocs) {
    const componentName = extractComponentName(docUrl);
    if (componentName) {
      const url = extractUrl(docUrl);
      const existing = map.get(componentName) || [];
      map.set(componentName, [...existing, url]);
    }
  }

  return map;
};

/**
 * usePatternFlyDocs tool function (tuple pattern)
 *
 * @param options
 */
const usePatternFlyDocsTool = (options = getOptions()): McpTool => {
  const memoProcess = memo(processDocsFunction, options?.toolMemoOptions?.usePatternFlyDocs);
  const componentToDocsMap = buildComponentToDocsMap();

  const callback = async (args: any = {}) => {
    const { urlList, searchQuery } = args;

    // If searchQuery is provided, use fuzzy search mode
    if (searchQuery && typeof searchQuery === 'string') {
      // Search against componentNames (single source of truth)
      const searchResults = fuzzySearch(searchQuery, componentNames, {
        maxDistance: 3,
        maxResults: 10,
        isFuzzyMatch: true,
        deduplicateByNormalized: true
      });

      if (searchResults.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No PatternFly components found matching "${searchQuery}".\n\nTry searching for a component name like "Button", "Table", or "Card".`
            }
          ]
        };
      }

      // Map matched component names to documentation URLs
      const matchedUrls: string[] = [];
      const seenUrls = new Set<string>();

      for (const result of searchResults) {
        const componentName = result.item;
        const urls = componentToDocsMap.get(componentName) || [];

        for (const url of urls) {
          if (!seenUrls.has(url)) {
            matchedUrls.push(url);
            seenUrls.add(url);
          }
        }
      }

      if (matchedUrls.length === 0) {
        const firstResult = searchResults[0];
        const firstComponent = firstResult ? firstResult.item : 'component';
        const componentList = searchResults
          .slice(0, 5)
          .map(r => r.item)
          .join(', ');
        return {
          content: [
            {
              type: 'text',
              text: `Found component "${firstComponent}" but no documentation URLs are available for it.\n\nMatched components: ${componentList}`
            }
          ]
        };
      }

      // Return the matched URLs as a formatted list
      const urlListText = matchedUrls
        .slice(0, 10) // Limit to top 10 URLs
        .map((url, index) => `${index + 1}. ${url}`)
        .join('\n');

      const componentList = searchResults
        .slice(0, 5)
        .map(r => `- ${r.item} (${r.matchType}, distance: ${r.distance})`)
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found ${searchResults.length} component(s) matching "${searchQuery}":\n\n${componentList}\n\nDocumentation URLs:\n${urlListText}\n\nUse the "fetchDocs" tool with these URLs to get the full documentation content.`
          }
        ]
      };
    }

    // Original behavior: use urlList parameter
    if (!urlList || !Array.isArray(urlList)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Either "searchQuery" (string) or "urlList" (array of strings) must be provided. Received: ${JSON.stringify(args)}`
      );
    }

    let result: string;

    try {
      result = await memoProcess(urlList);
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch documentation: ${error}`
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: result
        }
      ]
    };
  };

  return [
    'usePatternFlyDocs',
    {
      description: `Search for PatternFly component documentation or fetch index/overview files.

        This tool has two modes:

        **Search Mode** (recommended for discovery):
        - Use the "searchQuery" parameter to search for components by name (e.g., "button", "table", "accordion")
        - The tool uses fuzzy search against PatternFly component names and returns matching documentation URLs
        - Returns up to 10 relevant documentation URLs that you can then fetch with the "fetchDocs" tool

        **Direct URL Mode** (for known URLs):
        - Use the "urlList" parameter to fetch specific index/overview files (like README.md or llms.txt)
        - Returns the concatenated content from those files, which typically contain links to specific documentation pages

        After getting URLs from search mode or links from index files, use the "fetchDocs" tool to get the full documentation content.

        To get component prop definitions (JSON Schema), use the "componentSchemas" tool instead.`,
      inputSchema: z.object({
        searchQuery: z.string().optional().describe('Search for PatternFly components by name. Returns matching documentation URLs. Example: "button", "table", "accordion accessibility"'),
        urlList: z.array(z.string()).optional().describe('Array of URLs or file paths to fetch index/overview documentation files. Example: ["documentation/guidelines/README.md"]')
      }).refine(
        (data) => data.searchQuery !== undefined || (data.urlList !== undefined && Array.isArray(data.urlList) && data.urlList.length > 0),
        {
          message: 'Either "searchQuery" or "urlList" must be provided'
        }
      )
    },
    callback
  ];
};

export { usePatternFlyDocsTool };
