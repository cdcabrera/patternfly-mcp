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

type Tool = McpTool;

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
// type ToolPlugin = string | McpToolCreator | McpToolCreator[];
type ToolPlugin = string | McpToolCreator | McpToolCreator[];

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

  return (
    isArray &&
    typeof config[0] === 'string' &&
    isPlainObject(config[1]) &&
    typeof config[1].description === 'string' &&
    config[1].description.trim().length > 0 &&
    config[1].inputSchema !== undefined &&
    config[1].inputSchema !== null &&
    typeof config[1].inputSchema === 'object' &&
    typeof config[2] === 'function'
  );
};

/**
 * Minimally validate a tool config. Is it an object we expect?
 *
 * @param config
 */
const isToolObject = (config: any) => {
  const isObj = isPlainObject(config);

  return (
    isObj &&
    typeof config.name === 'string' &&
    typeof config.handler === 'function' &&
    typeof config.description === 'string' &&
    config.description.trim().length > 0 &&
    config.inputSchema !== undefined &&
    config.inputSchema !== null &&
    typeof config.inputSchema === 'object'
  );
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

/*
const toolWrapper = (config: any, name: string, type: 'string' | 'func' | 'tuple' | 'obj'): McpToolCreator => {
  const wrapper = () => config;

  wrapper.toolType = name;
  wrapper.toolName = type;

  return wrapper;
};
 */

/**
 * Author-facing helper for creating an MCP tool configuration list for Patternfly MCP server.
 *
 * @example A single file path string
 * export default createMcpTool('./a/file/path.mjs');
 *
 * @example A single package string
 * export default createMcpTool('@my-org/my-tool');
 *
 * @example A single tool configuration tuple
 * export default createMcpTool(['myTool', { description: 'My tool description' }, (args) => { ... }]);
 *
 * @example A single tool creator function
 * export default createMcpTool(() => ['myTool', { description: 'My tool description' }, (args) => { ... }]);
 *
 * @example A single tool configuration object
 * export default createMcpTool({ name: 'myTool', description: 'My tool description', inputSchema: {}, handler: (args) => { ... } });
 *
 * @example A multi-tool configuration array/list
 * export default createMcpTool(['./a/file/path.mjs', { name: 'myTool', description: 'My tool description', inputSchema: {}, handler: (args) => { ... } }]);
 *
 * @template TArgs The type of arguments expected by the tool (optional).
 * @template TResult The type of result returned by the tool (optional).
 * @param config - The configuration for creating the tool(s). It can be:
 *   - A single string representing the name of a local ESM predefined tool (`file path string` or `file URL string`). Limited to Node.js 22+
 *   - A single string representing the name of a local ESM tool package (`package string`). Limited to Node.js 22+
 *   - A single inline tool configuration tuple (`Tool`).
 *   - A single inline tool creator function returning a tuple (`ToolCreator`).
 *   - A single inline tool configuration object (`ToolConfig`).
 *   - An array of the aforementioned configuration types in any combination.
 * @returns An array of tool creators to apply to the MCP server `toolModules` option.
 *
 * @throws {Error} If the configuration is invalid, an error is thrown.
 */
const createMcpTool = <TArgs = unknown, TResult = unknown>(
  config: ToolConfig<TArgs, TResult> | ToolConfig[] | MultiToolConfig | ToolObjectConfig | ToolObjectConfig[]
): ToolPlugin => {
  const updatedConfigs = (Array.isArray(config) && config) || (config && [config]) || [];
  const invalidConfigs: any = [];
  const flattenedConfigs = updatedConfigs.flatMap(item => (Array.isArray(item) && item) || [item]);

  const normalizedConfigs: (string | ToolCreator)[] = flattenedConfigs.map((config, index) => {
    if (isToolFilePackage(config) || isToolFunction(config)) {
      return config;
    }

    if (isToolTuple(config)) {
      const updatedTuple = config;
      const creator: ToolCreator = () => updatedTuple;

      (creator as any).toolName = updatedTuple[0];

      return creator;
    }

    if (isToolObject(config)) {
      const updatedObj = config;
      const creator: ToolCreator = () => [
        updatedObj.name,
        {
          description: updatedObj.description,
          inputSchema: updatedObj.inputSchema
        },
        updatedObj.handler
      ];

      (creator as any).toolName = updatedObj.name;

      return creator;
    }

    invalidConfigs.push({ index, value: config, reason: `Unsupported type '${typeof config}'` });

    return undefined;
  });

  if (invalidConfigs.length) {
    const firstInvalid = invalidConfigs[0];

    throw new Error(`createMcpTool: invalid configuration used at index ${firstInvalid.index}: ${firstInvalid.reason}`, { cause: invalidConfigs });
  }

  return normalizedConfigs.filter(Boolean);
};

export {
  createMcpTool,
  isToolFilePackage,
  isToolFunction,
  isToolObject,
  isToolTuple,
  // createMcpToolFromMultiToolConfig,
  // createMcpToolFromSingleConfig,
  type MultiToolConfig,
  type ToolCreator,
  type Tool,
  type ToolConfig,
  type ToolPlugin,
  type ToolObjectConfig
};
