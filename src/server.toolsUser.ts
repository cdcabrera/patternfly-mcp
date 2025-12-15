import { isPlainObject } from './server.helpers';
import { type McpToolCreator, type McpTool } from './server';
import { type GlobalOptions } from './options';
// import { type ToolOptions } from './options.tools';

/**
 * An MCP tool "wrapper", or "creator", from `createMcpTool`.
 *
 * Passed back to `toolModules` in `PfMcpOptions` to register a tool.
 *
 * @alias McpToolCreator
 */
type ToolCreator = McpToolCreator;
// type ToolCreator = (options?: ToolOptions) => McpTool;

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
type ToolPlugin = string | McpToolCreator | McpToolCreator[];

type Tool = McpTool;
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
  description?: string;
  inputSchema?: any; // JSON Schema or Zod schema
  handler: (args: TArgs, options?: GlobalOptions) => Promise<TResult> | TResult;
};

/**
 * Strict validation; converts to McpToolCreator.
 * Public code-level authoring spec = same as ToolConfig. Optional `kind` is allowed but ignored.
 */
type ToolObjectConfig<TArgs = any, TResult = any> = ToolConfig<TArgs, TResult> & { kind?: 'handler' };

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
 * Minimally validate a tool config. Is it a tuple we expect?
 *
 * @param config
 */
const isToolTuple = (config: any) => {
  const isArray = Array.isArray(config) && config.length === 3;

  return isArray && typeof config[0] === 'string' && typeof config[1] === 'object' && typeof config[2] === 'function';
};

/**
 * Minimally validate a tool config. Is it an object we expect?
 *
 * @param config
 */
const isToolObject = (config: any) => {
  const isObj = isPlainObject(config);

  return isObj && typeof config.name === 'string' && typeof config.inputSchema === 'object' && typeof config.handler === 'function';
};

/**
 * Minimally validate a tool config.  Is it a function we expect?
 *
 * @param config
 */
const isToolFunction = (config: any) => typeof config === 'function';

/**
 * Minimally validate a tool config. Is it a string we expect?
 *
 * @param config
 */
const isToolFilePackage = (config: any) => typeof config === 'string';

/**
 * Create a minimally normalized MCP tool configuration array/list.
 *
 * @param config
 * @throws {Error} If the configuration is invalid, an error is thrown.
 */
const createMcpTool = <TArgs = unknown, TResult = unknown>(
  config: ToolConfig<TArgs, TResult> | ToolConfig[] | MultiToolConfig | ToolObjectConfig | ToolObjectConfig[]
): ToolPlugin => {
  const updatedConfigs = (Array.isArray(config) && config) || (config && [config]) || [];
  const invalidConfigs: any = [];

  const normalizedConfigs = updatedConfigs.map((config, index) => {
    if (isToolFilePackage(config) || isToolFunction(config) || isToolTuple(config)) {
      return config;
    }

    if (isToolObject(config)) {
      return {
        name: config.name,
        inputSchema: config.inputSchema,
        description: config.description,
        handler: config.handler
      };
    }

    invalidConfigs.push([index, config]);

    return undefined;
  });

  if (invalidConfigs.length) {
    throw new Error(`createMcpTool: invalid configuration(s) used.`, { cause: invalidConfigs });
  }

  return normalizedConfigs.filter(Boolean);
};

export {
  createMcpTool,
  // createMcpToolFromMultiToolConfig,
  // createMcpToolFromSingleConfig,
  type MultiToolConfig,
  type ToolCreator,
  type ToolConfig,
  type ToolPlugin,
  type ToolObjectConfig
};
