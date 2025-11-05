import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentNames, getComponentSchema } from '@patternfly/patternfly-component-schemas/json';
import { type McpTool } from './server';
import { OPTIONS } from './options';
import { memo } from './server.caching';
import { fuzzySearch } from './server.helpers';

/**
 * Component schema type from @patternfly/patternfly-component-schemas
 * This is the JSON Schema object returned directly from getComponentSchema
 */
type ComponentSchema = {
  $schema: string;
  type: string;
  title: string;
  description: string;
  properties: Record<string, any>;
  additionalProperties?: boolean;
  required?: string[];
};

/**
 * componentSchemas tool function (tuple pattern)
 *
 * @param options
 */
const componentSchemasTool = (options = OPTIONS): McpTool => {
  const memoGetComponentSchema = memo(
    async (componentName: string): Promise<ComponentSchema> => {
      return await getComponentSchema(componentName);
    },
    options.toolMemoOptions.fetchDocs // Use same memo options as fetchDocs
  );

  const callback = async (args: any = {}) => {
    const { componentName } = args;

    if (typeof componentName !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: componentName (must be a string): ${componentName}`
      );
    }

    // Try exact match first
    if (componentNames.includes(componentName) === false) {
      // Use fuzzySearch helper for suggestions
      const suggestions = fuzzySearch(componentName, componentNames, {
        maxDistance: 3,
        maxResults: 5
      });

      const suggestionMessage = suggestions.length > 0
        ? `Did you mean "${suggestions[0]?.item}"?`
        : 'No similar components found.';

      throw new McpError(
        ErrorCode.InvalidParams,
        `Component "${componentName}" not found. ${suggestionMessage}`
      );
    }

    // Get schema using memoized function
    let componentSchema: ComponentSchema;

    try {
      componentSchema = await memoGetComponentSchema(componentName);
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch component schema: ${error}`
      );
    }

    // Return schema as JSON string (schema is already the JSON Schema object)
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(componentSchema, null, 2)
        }
      ]
    };
  };

  return [
    'component-schemas',
    {
      description: 'Get JSON Schema for a PatternFly React component. Returns schema validation rules and prop documentation for the specified component.',
      inputSchema: {
        componentName: z.string().describe('Name of the PatternFly component (e.g., "Button", "Table")')
      }
    },
    callback
  ];
};

export { componentSchemasTool };
