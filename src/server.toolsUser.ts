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
 * Returns true if the tool config is valid. This is part of user-facing helpers, avoid using internal loggers.
 *
 * @param config
 */
/*
const isValidToolConfig = (config: ToolConfig) => {
  const isValid = config && typeof config.handler === 'function' && typeof config.name === 'string' && config.name.trim().length > 0;
  let err;

  if (!isValid) {
    err = 'Invalid single tool configuration.';
    console.warn(`Ignoring invalid tool ${config.name || ''}`);
  }

  return { ok: isValid, err };
};
*/

/**
 * Validate a ToolObjectConfig and return a result with an error message when invalid
 *
 * @param {ToolObjectConfig} config - Object spec to validate
 */
/*
const isValidToolConfigObject = (config: ToolObjectConfig) => {
  if (!isPlainObject(config)) {
    return { ok: false, msg: 'createMcpTool: spec must be an object' };
  }

  if (!config.name || typeof config.name !== 'string' || config.name.trim().length === 0) {
    return { ok: false, msg: 'createMcpTool: name is required (non-empty string)' };
  }

  if (!config.inputSchema) {
    return { ok: false, msg: 'createMcpTool: inputSchema is required' };
  }

  if (typeof config.handler !== 'function') {
    return { ok: false, msg: `createMcpTool: handler must be a function for tool '${config.name || '<unnamed>'}'` };
  }

  const allowed = new Set(['kind', 'name', 'description', 'inputSchema', 'handler']);
  const extraKeys = Object.keys(config).filter(k => !allowed.has(k));

  if (extraKeys.length) {
    console.warn(`createMcpTool: unknown keys [${extraKeys.join(', ')}]; allowed: [${[...allowed].join(', ')}]`);
  }

  return { ok: true };
};
*/

/**
 * Create a single tool creator from a single tool config.
 *
 * @param {ToolConfig} config - Tool config object
 * @returns {ToolCreator} ToolCreator function
 */
/*
const createMcpToolFromSingleConfig = (config: ToolConfig | ToolObjectConfig): ToolCreator => {
  const checkConfig = isValidToolConfig(config);
  const checkConfigObj = isValidToolConfigObject(config);

  if (!checkConfig.ok || !checkConfigObj.ok) {
    throw new Error(`Invalid tool configuration: ${checkConfig.err || ''} ${checkConfigObj.err || ''}`);
  }

  const creator: ToolCreator = () => [
    config.name,
    { description: config.description || '', inputSchema: config.inputSchema || {} },
    async args => await Promise.resolve(config.handler(args))
  ];

  (creator as any).toolName = config.name;

  return creator;
};
*/

/**
 * Create tool creators from a multi-tool config.
 *
 * Streamlined: returns McpToolCreator[] directly (legacy plugin objects removed).
 *
 * @param {MultiToolConfig} options - Multi-tool config object
 * @returns {ToolCreator[]} Array of tool creators
 */
/*
const createMcpToolFromMultiToolConfig = ({ tools }: MultiToolConfig): ToolCreator[] => {
  const creators: ToolCreator[] = [];

  for (const tool of tools) {
    const creator = createMcpToolFromSingleConfig(tool);

    if (creator) {
      creators.push(creator);
    }
  }

  return creators;
};
*/

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
 * @param config - The configuration for creating the tool(s). It can be:
 *   - A single tool configuration object (`ToolConfig`).
 *   - An array of tool configuration objects (`ToolConfig[]`) for creating multiple tools.
 * @returns A tool creator or application tool plugin instance based on the provided configuration.
 */
/*
const createMcpToolOLD = <TArgs = unknown, TResult = unknown>(
  config: ToolConfig<TArgs, TResult> | ToolConfig[] | MultiToolConfig | ToolObjectConfig | ToolObjectConfig[]
): ToolPlugin => {
// ): ToolCreator | ToolPlugin | AppToolPlugin => {
  // Multi-tool: array of ToolConfig
  if (Array.isArray(config)) {
    return config.map(createMcpToolFromSingleConfig);
  }

  // LOOKS LIKE A REMAINDER FROM THE OLD PLUGIN CONCEPT? DOES THIS TIE INTO THE NEW PHASES?
  // Multi-tool: { tools: ToolConfig[], name? }
  if (isPlainObject(config) && Array.isArray((config as MultiToolConfig).tools)) {
    const { tools } = config as MultiToolConfig;

    return createMcpToolFromMultiToolConfig({ tools });
  }

  return createMcpToolFromSingleConfig(config as ToolConfig);
};
*/

const isToolTuple = (config: any) => {
  const isArray = Array.isArray(config) && config.length === 3;

  return isArray && typeof config[0] === 'string' && typeof config[1] === 'object' && typeof config[2] === 'function';
};

const isToolObject = (config: any) => {
  const isObj = isPlainObject(config);

  return isObj && typeof config.name === 'string' && typeof config.inputSchema === 'object' && typeof config.handler === 'function';
};

const isToolFunction = (config: any) => typeof config === 'function';

const isToolFilePackage = (config: any) => typeof config === 'string';

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

// Tuple, isArray, index 1 === string, index 2 === schema, index 3 === handler
// Function that returns a tuple
// Object with keys, name, description, inputSchema, handler
// file strings
// package strings
// Array of all of the above

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
