import { isPlainObject } from './server.helpers';
import { type McpToolCreator } from './server';
import { type GlobalOptions } from './options';
import { type AppToolPlugin } from './server.toolsCreator';
// import { type AppToolPlugin } from './server.toolsCreator';

/**
 * An MCP tool "wrapper", or "creator", from `createMcpTool`.
 *
 * Passed back to `toolModules` in `PfMcpOptions` to register a tool.
 *
 * @alias McpToolCreator
 */
type ToolCreator = McpToolCreator;

/**
 * Author-facing "tools as plugins" surface.
 *
 * A tool plugin is a flexible type that supports either a single string identifier,
 * a specific tool creator, or multiple tool creators.
 *
 * - A `file path` or `file URL` string, that refers to the name or identifier of a predefined tool.
 * - An `McpToolCreator`, a function that creates the tool.
 * - An array of `McpToolCreator` functions.
 */
type ToolPlugin = string | McpToolCreator | AppToolPlugin;
// type ToolPlugin = string | ToolCreator | AppToolPlugin;
// type ToolPlugin = string | McpToolCreator | McpToolCreator[];
// type ToolPlugin = AppToolPlugin;
// type ToolPlugin = {
//  name?: string;
//  createCreators?: (options?: GlobalOptions) => McpToolCreator[];
// createTools?: (options?: GlobalOptions) => McpTool[];
// };

/**
 * Author-facing tool config. The handler may be async or sync.
 *
 * @template TArgs The type of arguments expected by the tool (optional).
 * @template TResult The type of result returned by the tool (optional).
 *
 * @property name - Name of the tool
 * @property description - Description of the tool
 * @property inputSchema - JSON Schema or Zod schema describing the arguments expected by the tool
 * @property {(args: TArgs, options?: GlobalOptions) => Promise<TResult> | TResult} handler - Tool handler
 *     - `args` are returned by the tool's `inputSchema`'
 *     - `options` are currently unused and reserved for future use.
 */
type ToolConfig<TArgs = any, TResult = any> = {
  name: string;
  description: string;
  inputSchema: any; // JSON Schema or Zod schema
  handler: (args: TArgs, options?: GlobalOptions) => Promise<TResult> | TResult;
};

/**
 * Author-facing multi-tool config.
 *
 * @property [name] - Optional name for the group of tools
 * @property {ToolConfig} tools - Array of tool configs
 */
type MultiToolConfig = {
  name?: string | undefined;
  tools: ToolConfig[]
};

/**
 * Returns true if the tool config is valid.
 *
 * @param config
 */
const isValidTool = (config: ToolConfig) => {
  const isValid = config && typeof config.handler === 'function' && typeof config.name === 'string' && config.name.trim().length > 0;

  if (!isValid) {
    // This is part of user-facing helpers, avoid using internal loggers.
    console.warn(`Ignoring invalid tool ${config.name || ''}`);
  }

  return isValid;
};

/**
 * Create a single tool creator from a single tool config.
 *
 * @param {ToolConfig} config - Tool config object
 * @returns {ToolCreator} ToolCreator function
 */
const createMcpToolFromSingleConfig = (config: ToolConfig): ToolCreator | undefined => {
  /*
  const name = config.name;
  // Don't normalize here - schemas will be serialized through IPC and Zod schemas can't be serialized
  // Normalization happens in makeProxyCreators when registering with MCP SDK
  const schema = { description: config.description, inputSchema: config.inputSchema };
  const handler = async (args: unknown) => await Promise.resolve(config.handler(args));

  return [name, schema, handler];
  */

  if (!isValidTool(config)) {
    return undefined;
  }

  const creator: ToolCreator = () => [
    config.name,
    { description: config.description, inputSchema: config.inputSchema },
    // async (args) => config.handler(args)
    // async (args: unknown) => await Promise.resolve(config.handler(args))
    async args => await Promise.resolve(config.handler(args))
  ];

  (creator as any).toolName = config.name;

  return creator;
};

/**
 * Create a `ToolPlugin` from a multi-tool config.
 *
 * @param {MultiToolConfig} options - Multi-tool config object
 * @returns {AppToolPlugin} ToolPlugin instance
 */
const createMcpToolFromMultiToolConfig = ({ name, tools }: MultiToolConfig): AppToolPlugin => (
  {
    ...(typeof name === 'string' && name ? { name } : {}),
    createCreators: () => {
      const creators: ToolCreator[] = [];

      for (const tool of tools) {
        // if (!tool || typeof tool.handler !== 'function' || typeof tool.name !== 'string') {
        //  log.warn(`Skipping invalid tool at index ${tools.indexOf(tool)} ${tool.name || ''}`);
        //  continue;
        // }
        const creator = createMcpToolFromSingleConfig(tool);

        if (creator) {
          creators.push(creator);
        }

        /*
        const creator: ToolCreator = () => {
          const name = tool.name;
          // Don't normalize here - schemas will be serialized through IPC and Zod schemas can't be serialized
          // Normalization happens in makeProxyCreators when registering with MCP SDK
          const schema = { description: tool.description, inputSchema: tool.inputSchema };
          const handler = async (args: unknown) => await Promise.resolve(tool.handler(args));

          return [name, schema, handler];
        };

        creators.push(creator);
        */
      }

      return creators;
    }
  }
);

// function createMcpTool<TArgs = any, TResult = any>(config: ToolConfig<TArgs, TResult>): ToolCreator;
// function createMcpTool(config: ToolConfig[]): ToolPlugin;
// function createMcpTool(config: MultiToolConfig): ToolPlugin;

/**
 * Returns a single creator for a single tool, or a `ToolPlugin` for multi-tools.
 *
 * Supports three types of configurations:
 * 1. Single-tool configuration: Accepts a single `ToolConfig` object and returns a tool based on the
 *    specified configuration.
 * 2. Multi-tool configuration as an array: Accepts an array of `ToolConfig` objects to create a group of tools.
 * 3. Multi-tool configuration as an object: Accepts a `MultiToolConfig` object, which includes multiple
 *    tools and optionally a group name, to create a set of tools with an associated name.
 *
 * @example Single tool
 * export default createMcpTool({
 *   name: 'hello',
 *   description: 'Say hello',
 *   inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
 *   async handler({ name }) { return `Hello, ${name}!`; }
 * });
 *
 * @example Multiple tools
 * export default createMcpTool([
 *   { name: 'hi', description: 'Hi', inputSchema: { type: 'object' }, handler: () => 'hi' },
 *   { name: 'bye', description: 'Bye', inputSchema: { type: 'object' }, handler: () => 'bye' }
 * ]);
 *
 * @example Multiple tools with a shared name
 * export default createMcpTool({
 *   name: 'my-plugin',
 *   tools: [
 *     { name: 'hi', description: 'Hi', inputSchema: { type: 'object' }, handler: () => 'hi' },
 *     { name: 'bye', description: 'Bye', inputSchema: { type: 'object' }, handler: () => 'bye' }
 *   ]
 * });
 *
 * @template TArgs The type of arguments expected by the tool (optional).
 * @template TResult The type of result returned by the tool (optional).
 * @param {ToolConfig<TArgs, TResult> | ToolConfig[] | MultiToolConfig} config The configuration for creating the tool(s). It can be:
 *   - A single tool configuration object (`ToolConfig`).
 *   - An array of tool configuration objects (`ToolConfig[]`) for creating multiple tools.
 *   - A multi-tool configuration object (`MultiToolConfig`) containing an optional name and an array of tools.
 * @returns {ToolCreator | AppToolPlugin} A tool creator or application tool plugin instance based on the provided configuration.
 */
const createMcpTool = <TArgs = unknown, TResult = unknown>(
  config: ToolConfig<TArgs, TResult> | ToolConfig[] | MultiToolConfig
): ToolPlugin => {
// ): ToolCreator | ToolPlugin | AppToolPlugin => {
  // Multi-tool: array of ToolConfig
  if (Array.isArray(config)) {
    const tools = config as ToolConfig[];

    return createMcpToolFromMultiToolConfig({ tools });
  }

  // Multi-tool: { tools: ToolConfig[], name? }
  if (isPlainObject(config) && Array.isArray((config as MultiToolConfig).tools)) {
    const { name, tools } = config as MultiToolConfig;

    return createMcpToolFromMultiToolConfig({ name, tools });
  }

  const single = createMcpToolFromSingleConfig(config as ToolConfig);

  // Single-tool: ToolConfig
  if (single) {
    return single;
  }

  throw new Error('Invalid tool configuration. Expected a single ToolConfig or an array of ToolConfigs. Review the documentation for creating tools.');
};

export {
  createMcpTool,
  createMcpToolFromMultiToolConfig,
  createMcpToolFromSingleConfig,
  type MultiToolConfig,
  type ToolCreator,
  type ToolConfig,
  type ToolPlugin
};
