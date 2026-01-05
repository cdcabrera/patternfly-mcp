import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentNames as pfComponentNames, getComponentSchema } from '@patternfly/patternfly-component-schemas/json';
import { type McpResource } from './server';
import { searchComponents } from './tool.searchPatternFlyDocs';
import { getOptions } from './options.context';
import { memo } from './server.caching';

/**
 * Derive the component schema type from @patternfly/patternfly-component-schemas
 */
type ComponentSchema = Awaited<ReturnType<typeof getComponentSchema>>;

/**
 * Name of the resource template.
 */
const NAME = 'patternfly-schemas-template';

/**
 * URI template for the resource.
 */
const URI_TEMPLATE = new ResourceTemplate('patternfly://schemas/{name}', { list: undefined });

/**
 * Resource configuration.
 */
const CONFIG = {
  title: 'PatternFly Component Schema',
  description: 'Retrieve the JSON Schema for a specific PatternFly component by name',
  mimeType: 'text/markdown'
};

/**
 * Resource creator for the component schemas template.
 *
 * @param options - Global options
 * @returns {McpResource} The resource definition tuple
 */
const patternFlySchemasTemplateResource = (options = getOptions()): McpResource => {
  const memoGetComponentSchema = memo(
    async (componentName: string) => getComponentSchema(componentName),
    options?.toolMemoOptions?.usePatternFlyDocs
  );

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

      let result: ComponentSchema;
      const { exactMatch, searchResults } = searchComponents.memo(name, pfComponentNames);

      if (exactMatch === undefined) {
        const suggestions = searchResults.map(result => result.item).slice(0, 3);
        const suggestionMessage = suggestions.length
          ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
          : 'No similar components found.';

        throw new McpError(
          ErrorCode.InvalidParams,
          `Component "${name.trim()}" not found. ${suggestionMessage}`
        );
      }

      try {
        result = await memoGetComponentSchema(exactMatch.item);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch component schema: ${error}`
        );
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    }
  ];
};

export { patternFlySchemasTemplateResource, NAME, URI_TEMPLATE, CONFIG };
