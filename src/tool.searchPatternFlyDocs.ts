import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentNames } from '@patternfly/patternfly-component-schemas/json';
import { type McpTool } from './server';
import { COMPONENT_DOCS } from './docs.component';
import { LAYOUT_DOCS } from './docs.layout';
import { CHART_DOCS } from './docs.chart';
import { getLocalDocs } from './docs.local';
import { getOptions } from './options.context';
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
  const allDocs = [...COMPONENT_DOCS, ...LAYOUT_DOCS, ...CHART_DOCS, ...getLocalDocs()];

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
 * searchPatternFlyDocs tool function (tuple pattern)
 *
 * Searches for PatternFly component documentation URLs using fuzzy search.
 * Returns URLs only (does not fetch content). Use usePatternFlyDocs to fetch the actual content.
 *
 * @param options
 */
const searchPatternFlyDocsTool = (options = getOptions()): McpTool => {
  const componentToDocsMap = buildComponentToDocsMap();

  const callback = async (args: any = {}) => {
    const { searchQuery } = args;

    if (!searchQuery || typeof searchQuery !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: searchQuery (must be a string): ${searchQuery}`
      );
    }

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
            text: `Found ${searchResults.length} component(s) matching "${searchQuery}":\n\n${componentList}\n\nDocumentation URLs:\n${urlListText}\n\nUse the "usePatternFlyDocs" tool with these URLs to get the full documentation content.`
        }
      ]
    };
  };

  return [
    'searchPatternFlyDocs',
    {
      description: `MCP Tool: Search for PatternFly component documentation URLs by component name.

        This is an MCP (Model Context Protocol) tool that must be called via JSON-RPC. It searches for documentation URLs but does NOT fetch content.

        **What this tool does**:
        - Uses fuzzy search against PatternFly component names to find matching documentation URLs
        - Returns URLs only (does NOT fetch or return documentation content)
        - Use "usePatternFlyDocs" to fetch the actual documentation from these URLs

        **How to call this MCP tool** (JSON-RPC format - works for both stdio and HTTP transport):
        {
          "method": "tools/call",
          "params": {
            "name": "searchPatternFlyDocs",
            "arguments": {
              "searchQuery": "button"
            }
          }
        }
        
        Note: The JSON-RPC format is the same whether using stdio (default) or HTTP transport. The transport layer only affects how messages are sent/received, not the tool call format.

        **Parameters**:
        - searchQuery (string, required): Component name to search for (e.g., "button", "table", "accordion")

        **Returns**: List of matching documentation URLs (as text) that can be passed to "usePatternFlyDocs" to get the full content.

        **Workflow**:
        1. Call searchPatternFlyDocs with searchQuery → get URLs (no content fetched)
        2. Call usePatternFlyDocs with those URLs → get full documentation content

        **Important**: This is an MCP tool call, not a code function. Call it via the MCP protocol with only the searchQuery parameter. This tool returns URLs only - use usePatternFlyDocs to fetch the actual documentation.`,
      inputSchema: {
        searchQuery: z.string().describe('Component name to search for. Returns matching documentation URLs. Example: "button", "table", "accordion"')
      }
    },
    callback
  ];
};

export { searchPatternFlyDocsTool };

