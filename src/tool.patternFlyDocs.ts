import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { getComponentSchema as pfGetComponentSchema } from '@patternfly/patternfly-component-schemas/json';
import { type McpTool } from './server';
import { getOptions } from './options.context';
import { processDocsFunction } from './server.getResources';
import { memo } from './server.caching';
import { setComponentToDocsMap, searchComponents } from './tool.searchPatternFlyDocs';
import { DEFAULT_OPTIONS } from './options.defaults';
import { log } from './logger';

/**
 * Get the component schema from @patternfly/patternfly-component-schemas.
 *
 * @param componentName
 */
const getComponentSchema = async (componentName: string) => {
  try {
    return await pfGetComponentSchema(componentName);
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
    const { urlList, name } = args;
    const isUrlList = urlList && Array.isArray(urlList) && urlList.length > 0 && urlList.every(url => typeof url === 'string' && url.trim().length > 0);
    const isName = typeof name === 'string' && name.trim().length > 0;

    if ((isUrlList && isName) || (!isUrlList && !isName)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Provide either a string "name" OR an array of strings "urlList".`
      );
    }

    const updatedUrlList = isUrlList ? urlList : [];

    if (name) {
      const { exactMatch, searchResults } = searchComponents.memo(name);

      if (exactMatch === undefined || exactMatch.urls.length === 0) {
        const suggestions = searchResults.map(result => result.item).slice(0, 3);
        const suggestionMessage = suggestions.length
          ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
          : 'No similar components found.';

        throw new McpError(
          ErrorCode.InvalidParams,
          `Component "${name.trim()}" not found. ${suggestionMessage}`
        );
      }

      updatedUrlList.push(...exactMatch.urls);
    }

    const docs = [];
    const schemasSeen = new Set<string>();
    const schemaResults = [];
    const docResults = [];

    try {
      const processedDocs = await memoProcess(updatedUrlList);

      docs.push(...processedDocs);
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch documentation: ${error}`
      );
    }

    if (docs.length === 0) {
      const urlListBlock = updatedUrlList.map((url: string, index: number) => `  ${index + 1}. ${url}`).join('\n');

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
            '  - To browse all available documentation, read the "patternfly://docs/index" URI resource.',
            '  - To browse all available components, read the "patternfly://schemas/index" URI resource.'
          ].join('\n')
        }]
      };
    }

    for (const doc of docs) {
      const componentName = getComponentToDocsKey(doc.path);

      docResults.push([
        `# Documentation${(componentName && ` for ${componentName}`) || ''} from ${doc.resolvedPath || doc.path || 'unknown'}`,
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
      description: `Fetch documentation and component JSON schemas content for specific PatternFly components and URLs.

      **Returns**:
      - Full markdown documentation content
      - Component JSON schemas, if available

      **Usage**:
      Provide one of the following:
      - A known PatternFly component "name"
      - A URL list of specific PatternFly documentation pages
      `,
      inputSchema: {
        urlList: z.array(z.string()).optional().describe('The list of URLs to fetch the documentation from'),
        name: z.string().optional().describe('The name of the known PatternFly component to fetch documentation for (e.g., "Button", "Table")')
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
