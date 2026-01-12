import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { getComponentSchema as pfGetComponentSchema } from '@patternfly/patternfly-component-schemas/json';
import { type McpTool } from './server';
import { getOptions } from './options.context';
import { processDocsFunction } from './server.getResources';
import { memo } from './server.caching';
import { setComponentToDocsMap } from './tool.searchPatternFlyDocs';
import { DEFAULT_OPTIONS } from './options.defaults';

/**
 * Get the component schema from @patternfly/patternfly-component-schemas.
 *
 * @param componentName
 */
const getComponentSchema = async (componentName: string) => {
  try {
    return pfGetComponentSchema(componentName);
  } catch {}

  return undefined;
};

/**
 * Memoized version of getComponentSchema.
 */
getComponentSchema.memo = memo(getComponentSchema, DEFAULT_OPTIONS.toolMemoOptions.usePatternFlyDocs);

/**
 * usePatternFlyDocs tool function
 *
 * @param options
 * @returns MCP tool tuple [name, schema, callback]
 */
const usePatternFlyDocsTool = (options = getOptions()): McpTool => {
  const memoProcess = memo(processDocsFunction, options?.toolMemoOptions?.usePatternFlyDocs);
  const { getKey: getComponentToDocsKey } = setComponentToDocsMap.memo();

  const callback = async (args: any = {}) => {
    const { urlList } = args;

    if (!urlList || !Array.isArray(urlList)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: urlList must be an array of strings: ${urlList}`
      );
    }

    const docs = [];
    const schemasSeen = new Set<string>();
    const schemaResults = [];
    const docResults = [];

    try {
      const processedDocs = await memoProcess(urlList);

      docs.push(...processedDocs);
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch documentation: ${error}`
      );
    }

    if (docs.length === 0) {
      const urlListBlock = urlList.map((url: string, index: number) => `  ${index + 1}. ${url}`).join('\n');

      return {
        content: [{
          type: 'text',
          text: [
            `No PatternFly documentation found for:`,
            urlListBlock,
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

    for (const doc of docs) {
      const componentName = getComponentToDocsKey(doc.path);

      docResults.push([
        `# Documentation from ${doc.resolvedPath || doc.path}`,
        '',
        doc.content
      ].join('\n'));

      if (componentName && !schemasSeen.has(componentName)) {
        schemasSeen.add(componentName);
        const componentSchema = await getComponentSchema.memo(componentName);

        if (componentSchema) {
          schemaResults.push([
            `# Component Schema for ${componentName}`,
            `This machine-readable JSON schema defines the component's props, types, and validation rules.`,
            '```json',
            JSON.stringify(componentSchema, null, 2),
            '```'
          ].join('\n'));
        }
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: [...docResults, ...schemaResults].join(options.separator)
        }
      ]
    };
  };

  return [
    'usePatternFlyDocs',
    {
      description: `Fetch documentation and component JSON schemas content for specific PatternFly URLs.

      **Discovery**:
        - To find specific URLs by component name, use the "searchPatternFlyDocs" tool.
        - To browse all available documentation URLs, read the "patternfly://docs/index" resource.
        - To browse all available components, read the "patternfly://schemas/index" resource.

      **Usage**:
        - Provide a list of URLs discovered through "searchPatternFlyDocs" or available resources to retrieve full PatternFly markdown content and related component JSON schemas.
      `,
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

export { usePatternFlyDocsTool, getComponentSchema };
