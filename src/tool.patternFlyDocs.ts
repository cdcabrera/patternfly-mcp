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
      description: `Fetch PatternFly documentation from one or more URLs.

        Fetches and returns the concatenated content from PatternFly documentation URLs.
        Can be used for:
        - Index/overview files (README.md, llms.txt) that contain links to other pages
        - Specific documentation pages (design guidelines, accessibility, etc.)
        - Any PatternFly documentation URL

        **Parameters**:
        - urlList (array of strings, required): Array of URLs or file paths to PatternFly documentation

        **Returns**: Concatenated content from the documentation URLs.

        **Workflow**:
        1. searchPatternFlyDocs with searchQuery → get URLs (use this to discover documentation URLs by component name)
        2. usePatternFlyDocs with those URLs → get full documentation
        OR
        1. usePatternFlyDocs with index file URLs → get index content
        2. Parse links: Extract URLs from the index content
        3. usePatternFlyDocs with those URLs → get full documentation

        **Example - Local path**:
        Call this tool with urlList: ["documentation/guidelines/README.md"] to get the guidelines index.

        **Example - Remote URL**:
        Call this tool with urlList: ["https://example.com/patternfly/docs/component/button.md"] to get specific documentation.

        **Note**: URLs can be local file paths (relative to the docs directory) or remote HTTP/HTTPS URLs. Use searchPatternFlyDocs to discover available documentation URLs.

        **Finding URLs**: If you don't know the exact URLs, use the "searchPatternFlyDocs" tool to search for component documentation URLs by name. Then pass those URLs to this tool to fetch the content.
        To get component prop definitions (JSON Schema), use the "componentSchemas" tool instead.`,
      inputSchema: {
        urlList: z.array(z.string()).describe('Array of URLs or file paths to PatternFly documentation. Can be local paths (e.g., "documentation/guidelines/README.md") or remote URLs (e.g., "https://example.com/patternfly/docs/component.md"). Use searchPatternFlyDocs to discover available URLs.')
      }
    },
    callback
  ];
};

export { usePatternFlyDocsTool };
