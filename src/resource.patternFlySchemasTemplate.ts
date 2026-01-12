import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentNames as pfComponentNames } from '@patternfly/patternfly-component-schemas/json';
import { type McpResource } from './server';
import { getComponentSchema } from './tool.patternFlyDocs';
import { searchComponents } from './tool.searchPatternFlyDocs';

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
  mimeType: 'application/json'
};

/**
 * Resource creator for the component schemas template.
 *
 * @returns {McpResource} The resource definition tuple
 */
const patternFlySchemasTemplateResource = (): McpResource => [
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

    const { exactMatch, searchResults } = searchComponents.memo(name, pfComponentNames);
    let result: ComponentSchema;

    if (exactMatch) {
      result = await getComponentSchema.memo(exactMatch.item);
    }

    if (result === undefined) {
      const suggestions = searchResults.map(result => result.item).slice(0, 3);
      const suggestionMessage = suggestions.length
        ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
        : 'No similar components found.';

      throw new McpError(
        ErrorCode.InvalidParams,
        `Component "${name.trim()}" not found. ${suggestionMessage}`
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

export { patternFlySchemasTemplateResource, NAME, URI_TEMPLATE, CONFIG };
