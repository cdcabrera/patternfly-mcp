import { join } from 'node:path';
import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpTool } from './server';
import { COMPONENT_DOCS } from './docs.component';
import { LAYOUT_DOCS } from './docs.layout';
import { CHART_DOCS } from './docs.chart';
import { getLocalDocs } from './docs.local';
import { getOptions } from './options.context';
import { processDocsFunction } from './server.getResources';
import { memo } from './server.caching';

/**
 * usePatternFlyDocs tool function (tuple pattern)
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
      description: `Use this tool to answer any questions related to PatternFly components or documentation.

        Listed below are URL links to ${options.docsHost ? 'llms.txt' : '.md'} PatternFly components and documentation:

        ${options.docsHost
            ? `[@patternfly/react-core@6.0.0^](${join('react-core', '6.0.0', 'llms.txt')})`
            : `
            - ${COMPONENT_DOCS.join('\n- ')}
            - ${LAYOUT_DOCS.join('\n- ')}
            - ${CHART_DOCS.join('\n- ')}
            - ${getLocalDocs().join('\n- ')}
          `
        }

        To use the tool:
        1. Pick the most suitable URL, or URLS, from the above list
        2. Submit the URL or URLs as an array to the "urlList" argument.
        3. Analyze the URLs listed in the ${options.docsHost ? 'llms.txt' : '.md'} file
        4. Then fetch specific documentation pages relevant to the user's question with the subsequent tool call.`,
      inputSchema: {
        urlList: z.array(z.string()).describe('The array list of a URL or URLs to fetch documentation from')
      }
    },
    callback
  ];
};

export { usePatternFlyDocsTool };
