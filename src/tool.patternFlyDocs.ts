import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpTool } from './server';
import { getOptions } from './options.context';
import { processDocsFunction } from './server.getResources';
import { memo } from './server.caching';
import { stringJoin } from './server.helpers';
import { searchComponents } from './tool.searchPatternFlyDocs';
import { log } from './logger';
import {
  getPatternFlyMcpDocs,
  getPatternFlyComponentSchema,
  type PatternFlyMcpDocsByPathEntry
} from './patternFly.getResources';

/**
 * usePatternFlyDocs tool function
 *
 * @param options
 * @returns MCP tool tuple [name, schema, callback]
 */
const usePatternFlyDocsTool = (options = getOptions()): McpTool => {
  const memoProcess = memo(processDocsFunction, options?.toolMemoOptions?.usePatternFlyDocs);

  const callback = async (args: any = {}) => {
    const { urlList, name } = args;
    const isUrlList = urlList && Array.isArray(urlList) && urlList.length > 0 && urlList.every(url => typeof url === 'string' && url.trim().length > 0);
    const isName = typeof name === 'string' && name.trim().length > 0;
    const hasUri = (isName && new RegExp('patternfly://', 'i').test(name)) || (isUrlList && urlList.some(url => new RegExp('patternfly://', 'i').test(url)));

    if (hasUri) {
      throw new McpError(
        ErrorCode.InvalidParams,
        stringJoin.basic(
          'Direct "patternfly://" URIs are not supported as tool inputs, and are intended to be used directly.',
          'Use a component "name" or provide a "urlList" of raw documentation URLs.'
        )
      );
    }

    if ((isUrlList && isName) || (!isUrlList && !isName)) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Provide either a string "name" OR an array of strings "urlList".`
      );
    }

    if (isName && name.length > options.maxSearchLength) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `String "name" exceeds maximum length of ${options.maxSearchLength} characters.`
      );
    }

    const updatedUrlList = isUrlList ? urlList.slice(0, options.recommendedMaxDocsToLoad) : [];

    if (isUrlList && urlList.length > options.recommendedMaxDocsToLoad) {
      log.warn(
        `usePatternFlyDocs: urlList truncated from ${urlList.length} to ${options.recommendedMaxDocsToLoad} items.`
      );
    }

    if (name) {
      const { exactMatches, searchResults } = searchComponents.memo(name);

      if (exactMatches.length === 0 || exactMatches.every(match => match.urls.length === 0)) {
        const suggestions = searchResults.map(result => result.item).slice(0, 3);
        const suggestionMessage = suggestions.length
          ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
          : 'No similar components found.';

        throw new McpError(
          ErrorCode.InvalidParams,
          `Component "${name.trim()}" not found. ${suggestionMessage}`
        );
      }

      updatedUrlList.push(...exactMatches.flatMap(match => match.urls));
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
          text: stringJoin.newline(
            `No PatternFly documentation found for:`,
            urlListBlock,
            '',
            '---',
            '',
            '**Important**:',
            '  - To browse all available components use "searchPatternFlyDocs" with a search all ("*").'
          )
        }]
      };
    }

    for (const doc of docs) {
      let entry = { name: 'Documentation', category: 'unknown' } as PatternFlyMcpDocsByPathEntry;

      if (doc.path) {
        entry = getPatternFlyMcpDocs.memo().byPath[doc.path] || entry;
      }

      const componentName = entry.name;

      docResults.push(stringJoin.newline(
        `# ${entry.displayName || componentName} [${entry.category}]`,
        `Source: ${doc.path || 'unknown'}`,
        '',
        doc.content
      ));

      if (componentName && !schemasSeen.has(componentName)) {
        schemasSeen.add(componentName);
        const componentSchema = await getPatternFlyComponentSchema.memo(componentName);

        if (componentSchema) {
          schemaResults.push(stringJoin.newline(
            `# Component Schema for ${componentName}`,
            `This machine-readable JSON schema defines the component's props, types, and validation rules.`,
            '```json',
            JSON.stringify(componentSchema, null, 2),
            '```'
          ));
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
      description: `Get markdown documentation and component JSON schemas for PatternFly components.

      **Usage**:
        1. Input a component name (e.g., "Button") OR a list of up to ${options.recommendedMaxDocsToLoad} documentation URLs at a time (typically from searchPatternFlyDocs results).

      **Returns**:
        - Markdown documentation
        - Component JSON schemas, if available
      `,
      inputSchema: {
        urlList: z.array(z.string()).max(options.recommendedMaxDocsToLoad).optional().describe(`The list of URLs to fetch the documentation from (max ${options.recommendedMaxDocsToLoad} at a time`),
        name: z.string().max(options.maxSearchLength).optional().describe('The name of a PatternFly component to fetch documentation for (e.g., "Button", "Table")')
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
