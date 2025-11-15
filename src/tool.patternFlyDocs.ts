import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpTool } from './server';
import { getOptions } from './options.context';
import { processDocsFunction } from './server.getResources';
import { memo } from './server.caching';

/**
 * usePatternFlyDocs tool function (tuple pattern)
 *
 * Fetches index/overview documentation files (like README.md or llms.txt).
 * Returns the concatenated content from those files, which typically contain links to specific documentation pages.
 *
 * @param options
 */
const usePatternFlyDocsTool = (options = getOptions()): McpTool => {
  const memoProcess = memo(processDocsFunction, options?.toolMemoOptions?.usePatternFlyDocs);

  const callback = async (args: any = {}) => {
    const { urlList } = args;

    if (!urlList || !Array.isArray(urlList)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: urlList (must be an array of strings): ${urlList}`
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
      description: `MCP Tool: Fetch PatternFly documentation from one or more URLs.

        This is an MCP (Model Context Protocol) tool that must be called via JSON-RPC. It fetches and returns the concatenated content from PatternFly documentation URLs.

        **What this tool does**:
        - Fetches documentation content from URLs (does NOT search - use searchPatternFlyDocs for that)
        - Returns concatenated text content from the documentation
        - Works with index/overview files (README.md, llms.txt) or specific documentation pages

        **How to call this MCP tool** (JSON-RPC format):
        {
          "method": "tools/call",
          "params": {
            "name": "usePatternFlyDocs",
            "arguments": {
              "urlList": ["documentation/guidelines/README.md"]
            }
          }
        }

        **Parameters**:
        - urlList (array of strings, required): Array of URLs or file paths. Can be local paths (e.g., "documentation/guidelines/README.md") or remote URLs (e.g., "https://www.patternfly.org/components/button")

        **Returns**: Text content from the documentation URLs (concatenated if multiple URLs provided).

        **Workflow**:
        1. Use searchPatternFlyDocs with component name → get documentation URLs
        2. Use usePatternFlyDocs with those URLs → get full documentation content
        OR
        1. Use usePatternFlyDocs with index file URL → get index content with links
        2. Extract URLs from the index content
        3. Use usePatternFlyDocs with those URLs → get full documentation

        **Important**: This is an MCP tool call, not a code function or UI button. Call it via the MCP protocol with the urlList parameter only. Do not include searchQuery or other parameters - use searchPatternFlyDocs for searching.`,
      inputSchema: {
        urlList: z.array(z.string()).describe('Array of URLs or file paths to PatternFly documentation. Can be local paths (e.g., "documentation/guidelines/README.md") or remote URLs (e.g., "https://example.com/patternfly/docs/component.md"). Use searchPatternFlyDocs to discover available URLs.')
      }
    },
    callback
  ];
};

export { usePatternFlyDocsTool };
