import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource } from './server';
import { processDocsFunction } from './server.getResources';
import { searchComponents } from './tool.searchPatternFlyDocs';
import { getOptions } from './options.context';
import { memo } from './server.caching';

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-docs-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = new ResourceTemplate('patternfly://docs/{name}', { list: undefined });

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Documentation Page',
  description: 'Retrieve specific PatternFly documentation by name or path',
  mimeType: 'text/markdown'
};

/**
 * Resource creator for the documentation template.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlyDocsTemplateResource = (options = getOptions()): McpResource => {
  const memoProcess = memo(processDocsFunction, options?.toolMemoOptions?.usePatternFlyDocs);

  return [
    NAME,
    URI_TEMPLATE,
    CONFIG,
    async (uri: URL, variables: Record<string, string>) => {
      const { name } = variables || {};

      if (!name || typeof name !== 'string') {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Missing required parameter: name must be a string: ${name}`
        );
      }

      const docResults = [];
      const docs = [];
      const { exactMatch, searchResults } = searchComponents(name);

      if (exactMatch === undefined || exactMatch.urls.length === 0) {
        const suggestions = searchResults.map(result => result.item).slice(0, 3);
        const suggestionMessage = suggestions.length
          ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
          : 'No similar components found.';

        throw new McpError(
          ErrorCode.InvalidParams,
          `No documentation found for component "${name.trim()}". ${suggestionMessage}`
        );
      }

      try {
        const processedDocs = await memoProcess(exactMatch.urls);

        docs.push(...processedDocs);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch documentation: ${error}`
        );
      }

      for (const doc of docs) {
        docResults.push([
          `# Documentation from ${doc.resolvedPath || doc.path}`,
          '',
          doc.content
        ].join('\n'));
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: docResults.join(options.separator)
          }
        ]
      };
    }
  ];
};

export { patternFlyDocsTemplateResource, NAME, URI_TEMPLATE, CONFIG };
