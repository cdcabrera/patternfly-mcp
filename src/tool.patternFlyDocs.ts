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
      description: `Fetch index/overview documentation files for PatternFly components.

        Fetches and returns the concatenated content from index/overview files (like README.md or llms.txt).
        These index files typically contain links to specific documentation pages.

        **Parameters**:
        - urlList (array of strings, required): Array of URLs or file paths to index/overview documentation files

        **Returns**: Concatenated content from the index files, which typically contain links to specific documentation pages.

        **Workflow**:
        1. usePatternFlyDocs with urlList → get index file content
        2. Parse links: Extract URLs from the index content
        3. fetchDocs with those URLs → get full documentation

        **Example**:
        Call this tool with urlList: ["documentation/guidelines/README.md"] to get the guidelines index.

        To search for component documentation URLs by name, use the "searchPatternFlyDocs" tool instead.
        To get component prop definitions (JSON Schema), use the "componentSchemas" tool instead.`,
      inputSchema: {
        urlList: z.array(z.string()).describe('Array of URLs or file paths to fetch index/overview documentation files. Example: ["documentation/guidelines/README.md"]')
      }
    },
    callback
  ];
};

export { usePatternFlyDocsTool };
