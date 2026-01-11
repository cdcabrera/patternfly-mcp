import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { getComponentSchema } from '@patternfly/patternfly-component-schemas/json';
import { type McpTool } from './server';
import { getOptions } from './options.context';
import { processDocsFunction } from './server.getResources';
import { memo } from './server.caching';
import { buildComponentToDocsMap } from './tool.searchPatternFlyDocs';
import { log } from './logger';

/**
 * Derive the component schema type from @patternfly/patternfly-component-schemas
 */
type ComponentSchema = Awaited<ReturnType<typeof getComponentSchema>>;

/**
 * usePatternFlyDocs tool function
 *
 * @param options
 * @returns MCP tool tuple [name, schema, callback]
 */
const usePatternFlyDocsTool = (options = getOptions()): McpTool => {
  const memoProcess = memo(processDocsFunction, options?.toolMemoOptions?.usePatternFlyDocs);
  const { getKey: getComponentToDocsKey } = buildComponentToDocsMap.memo();
  const memoGetComponentSchema = memo(
    async (componentName: string): Promise<ComponentSchema> => getComponentSchema(componentName),
    options?.toolMemoOptions?.usePatternFlyDocs
  );

  const callback = async (args: any = {}) => {
    const { urlList } = args;

    if (!urlList || !Array.isArray(urlList)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: urlList must be an array of strings: ${urlList}`
      );
    }

    const result = [];

    try {
      const processedDocs = await memoProcess(urlList);

      result.push(processedDocs);
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch documentation: ${error}`
      );
    }

    try {
      if (urlList.length === 1) {
        const componentName = getComponentToDocsKey(urlList[0]);

        if (componentName) {
          const componentSchema = await memoGetComponentSchema(componentName);

          result.push(...[
            result.length ? '' : undefined,
            result.length ? '---' : undefined,
            result.length ? '' : undefined,
            `## Component Schema: ${componentName}`,
            `This machine-readable JSON schema defines the component's props, types, and validation rules.`,
            '```json',
            JSON.stringify(componentSchema, null, 2),
            '```'
          ]);
        }
      }
    } catch (error) {
      log.error(`Failed to get component schema from URL: ${error}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: result.filter(Boolean).join('\n')
        }
      ]
    };
  };

  return [
    'usePatternFlyDocs',
    {
      description: `Fetch documentation content for specific PatternFly components or layouts.

      **Discovery**:
        - To find specific URLs by component name, use the "searchPatternFlyDocs" tool.
        - To browse all available documentation, read the "patternfly://docs/index" resource.
        - To browse all available components, read the "patternfly://schemas/index" resource.

      **Usage**:
      Provide a list of URLs discovered via the search tool or available resources to retrieve their full markdown content and related component schemas.`,
      inputSchema: {
        urlList: z.array(z.string()).describe('The list of urls to fetch the documentation from')
      }
    },
    callback
  ];
};

/**
 * A tool name, typically the first entry in the tuple. Used in logging and deduplication.
 */
usePatternFlyDocsTool.toolName = 'usePatternFlyDocs';

export { usePatternFlyDocsTool };
