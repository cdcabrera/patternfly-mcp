import { z } from 'zod';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { componentNames, getComponentSchema } from '@patternfly/patternfly-component-schemas/json';
import { type McpTool } from './server';
import { getOptions } from './options.context';
import { memo } from './server.caching';
import { fuzzySearch } from './server.search';

/**
 * Derive the component schema type from @patternfly/patternfly-component-schemas
 */
type ComponentSchema = Awaited<ReturnType<typeof getComponentSchema>>;

/**
 * componentSchemas tool function (tuple pattern)
 *
 * Creates an MCP tool that retrieves JSON Schema for PatternFly React components.
 * Uses fuzzy search to handle typos and case variations, with related fallback suggestions.
 *
 * @param options - Optional configuration options (defaults to OPTIONS)
 * @returns {McpTool} MCP tool tuple [name, schema, callback]
 */
const componentSchemasTool = (options = getOptions()): McpTool => {
  const memoGetComponentSchema = memo(
    async (componentName: string): Promise<ComponentSchema> => getComponentSchema(componentName),
    options?.toolMemoOptions?.usePatternFlyDocs // Use the same memo options as usePatternFlyDocs
  );

  const callback = async (args: any = {}) => {
    const { componentName } = args;

    if (typeof componentName !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing required parameter: componentName (must be a string): ${componentName}`
      );
    }

    // Use fuzzySearch with `isFuzzyMatch` to handle exact and intentional suggestions in one pass
    const results = fuzzySearch(componentName, componentNames, {
      maxDistance: 3,
      maxResults: 5,
      isFuzzyMatch: true,
      deduplicateByNormalized: true
    });

    const exact = results.find(result => result.matchType === 'exact');

    if (exact) {
      let componentSchema: ComponentSchema;

      try {
        componentSchema = await memoGetComponentSchema(exact.item);
      } catch (error) {
        throw new McpError(
          ErrorCode.InternalError,
          `Failed to fetch component schema: ${error}`
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(componentSchema, null, 2)
          }
        ]
      };
    }

    const suggestions = results.map(result => result.item).slice(0, 3);
    const suggestionMessage = suggestions.length
      ? `Did you mean ${suggestions.map(suggestion => `"${suggestion}"`).join(', ')}?`
      : 'No similar components found.';

    throw new McpError(
      ErrorCode.InvalidParams,
      `Component "${componentName.trim()}" not found. ${suggestionMessage}`
    );
  };

  return [
    'componentSchemas',
    {
      description: `MCP Tool: Get JSON Schema for PatternFly React components. Returns prop definitions, types, and validation rules.

        This is an MCP (Model Context Protocol) tool that must be called via JSON-RPC. It returns the complete JSON Schema for a PatternFly React component.

        **What this tool does**:
        - Returns JSON Schema (as text) containing all prop definitions, types, and validation rules
        - Uses fuzzy matching to find components by name
        - Works only with PatternFly React components

        **How to call this MCP tool** (JSON-RPC format - works for both stdio and HTTP transport):
        {
          "method": "tools/call",
          "params": {
            "name": "componentSchemas",
            "arguments": {
              "componentName": "Button"
            }
          }
        }
        
        Note: The JSON-RPC format is the same whether using stdio (default) or HTTP transport. The transport layer only affects how messages are sent/received, not the tool call format.

        **Parameters**:
        - componentName (string, required): The name of the PatternFly component (e.g., "Button", "Tabs", "Card")

        **Returns**: JSON Schema as a string containing all prop definitions, types, and validation rules for the specified component.

        **Fuzzy Matching**: The tool uses fuzzy matching, so "But" will match "Button", and "tab" will match "Tabs".

        **Important**: This is an MCP tool call, not a code function or UI workflow. Call it via the MCP protocol with only the componentName parameter. Do not include props, type, or other parameters - the tool returns the complete schema.`,
      inputSchema: {
        componentName: z.string().describe('Exact or partial name of the PatternFly component (e.g., "Button", "But", "Tabs")')
      }
    },
    callback
  ];
};

export { componentSchemasTool };
