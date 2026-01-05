import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { type McpResource } from './server';
import { processDocsFunction } from './server.getResources';
import { getOptions } from './options.context';
import { memo } from './server.caching';

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-docs-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = 'patternfly://docs/{name}';

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

      let result: string;

      try {
        result = await memoProcess([name as string]);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch documentation: ${error}`
        );
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: result
          }
        ]
      };
    }
  ];
};

export { patternFlyDocsTemplateResource, NAME, URI_TEMPLATE, CONFIG };
