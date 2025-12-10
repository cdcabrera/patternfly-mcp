import { type McpTool, type McpToolCreator } from './server';
import { log, formatUnknownError } from './logger';
import { isPlainObject } from './server.helpers';
import { type GlobalOptions } from './options';

/**
 * AppToolPlugin — "tools as plugins" surface.
 *
 * Implementation note:
 * - Some plugins may expose `createCreators(options)` and return `McpToolCreator[]` directly.
 * - Others may expose `createTools(options)` and return `McpTool[]`. We adapt those into creators
 *   via `pluginToolsToCreators()` with a light check (calling with no options) to determine viability.
 *
 * @property [name] - An optional name for the plugin.
 * @property [createCreators] - Optionally, generate an array of tool creators based on the
 *     provided global options. Tool creators are preferred over tools to avoid "double-construction".
 * @property [createTools] - Optionally, generate an array of tools based on the provided global
 *     options. Tools will be adapted to creators if necessary.
 */
type AppToolPlugin = {
  name?: string;
  createCreators?: (options?: GlobalOptions) => McpToolCreator[];
  createTools?: (options?: GlobalOptions) => McpTool[];
};

/**
 * Plugin factory signature.
 */
type AppToolPluginFactory = (options?: GlobalOptions) => AppToolPlugin;

/**
 * Is the value a recognized plugin shape.
 *
 * @param value - Value to check
 * @returns `true` if the value is a recognized plugin shape.
 */
const isPlugin = (value: unknown): value is AppToolPlugin =>
  isPlainObject(value) && (typeof value.createCreators === 'function' || typeof value.createTools === 'function');

/**
 * Adapt a plugin that exposes `createCreators()` into an array of tool creators.
 *
 * @param {AppToolPlugin} plugin - Plugin instance
 * @returns {McpToolCreator[]} Array of tool creators
 */
const pluginCreatorsToCreators = (plugin: AppToolPlugin): McpToolCreator[] => {
  try {
    const creators = plugin.createCreators?.();

    if (Array.isArray(creators) && creators.every(creator => typeof creator === 'function')) {
      return creators as McpToolCreator[];
    }
  } catch (error) {
    log.warn(`Plugin '${plugin.name || 'unknown'}' createCreators() failed`);
    log.warn(formatUnknownError(error));
  }

  return [];
};

/**
 * Adapt a plugin that exposes `createTools()` into creators.
 *
 * If no tools are discovered during an initial check, a single creator is
 * returned that will attempt to resolve the first tool at registration time
 * and throw if none are available.
 *
 * @param {AppToolPlugin} plugin - Plugin instance
 * @returns {McpToolCreator[]} Array of tool creators
 *
 * @throws {Error} If the tool remains missing at registration time.
 */
const pluginToolsToCreators = (plugin: AppToolPlugin): McpToolCreator[] => {
  let checkedTools: McpTool[] = [];

  try {
    checkedTools = plugin.createTools?.() ?? [];
  } catch (error) {
    // Checking without options may fail for some plugins; just log and continue
    log.warn(
      `Plugin '${plugin.name || 'unknown'}' createTools() check failed (will still be attempted at runtime)`
    );
    log.warn(formatUnknownError(error));
  }

  const makeCreatorAt = (toolIndex: number): McpToolCreator => (options?: GlobalOptions) => {
    const toolsAtRuntime = plugin.createTools?.(options) ?? [];
    const selectedTool = toolsAtRuntime[toolIndex] ?? toolsAtRuntime[0];

    if (!selectedTool) {
      throw new Error(
        `Plugin '${plugin.name || 'unknown'}' did not provide a tool at index ${toolIndex}`
      );
    }

    return selectedTool;
  };

  // If the check yielded nothing, still expose a single creator that will
  // try to return the first tool at runtime (permissive behavior).
  if (checkedTools.length === 0) {
    return [makeCreatorAt(0)];
  }

  const creators: McpToolCreator[] = [];

  checkedTools.forEach((_tool, index) => {
    creators.push(makeCreatorAt(index));
  });

  return creators;
};

/**
 * Convert any recognized plugin shape to `McpToolCreator[]`.
 *
 * @param {AppToolPlugin} plugin - Plugin instance
 * @returns {McpToolCreator[]} Array of tool creators
 */
const pluginToCreators = (plugin: AppToolPlugin): McpToolCreator[] => {
  const creators = pluginCreatorsToCreators(plugin);

  if (creators.length) {
    return creators;
  }

  return pluginToolsToCreators(plugin);
};

/**
 * Normalize a dynamically imported module into an array of tool creators.
 *
 * Recognized shapes, default export or named:
 * - `McpToolCreator` function
 * - `AppToolPluginFactory` (returns plugin)
 * - `AppToolPlugin` object
 * - `McpToolCreator[]`
 *
 * @param moduleExports - Imported module
 * @returns {McpToolCreator[]} Array of tool creators
 */
const normalizeToCreators = (moduleExports: any): McpToolCreator[] => {
  const candidates: unknown[] = [moduleExports?.default, moduleExports].filter(Boolean);

  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      let result: unknown;

      try {
        // Invoke once without options to inspect the shape
        result = (candidate as () => unknown)();
      } catch {}

      // Case: already a tool creator (tuple check)
      if (Array.isArray(result) && typeof result[0] === 'string') {
        return [candidate as McpToolCreator];
      }

      // Case: plugin factory that returned a plugin object
      if (isPlugin(result)) {
        const creators = pluginToCreators(result as AppToolPlugin);

        if (creators.length) {
          return creators;
        }
      }
    }

    // Case: plugin object
    if (isPlugin(candidate)) {
      const creators = pluginToCreators(candidate as AppToolPlugin);

      if (creators.length) {
        return creators;
      }
    }

    // Case: array of tool creators
    if (Array.isArray(candidate) && candidate.every(candidateFunction => typeof candidateFunction === 'function')) {
      return candidate as McpToolCreator[];
    }
  }

  return [];
};

/**
 * Author-facing tool config. The handler may be async or sync.
 */
type ToolConfig<TArgs = unknown, TResult = unknown> = {
  name: string;
  description: string;
  inputSchema: any; // JSON Schema
  handler: (args: TArgs, options?: GlobalOptions) => Promise<TResult> | TResult;
};

/**
 * Author-facing multi-tool config.
 */
type MultiToolConfig = { name?: string | undefined; tools: ToolConfig[] };

/**
 * Create an AppToolPlugin from a multi-tool config.
 *
 * @param {MultiToolConfig} options - Multi-tool config object
 * @returns {AppToolPlugin} AppToolPlugin instance
 */
const createMcpToolFromMultiToolConfig = ({ name, tools }: MultiToolConfig): AppToolPlugin => (
  {
    ...(typeof name === 'string' && name ? { name } : {}),
    createCreators: () => {
      const creators: McpToolCreator[] = [];

      for (const tool of tools) {
        if (!tool || typeof tool.handler !== 'function' || typeof tool.name !== 'string') {
          log.warn(`Skipping invalid tool at index ${tools.indexOf(tool)} ${tool.name || ''}`);
          continue;
        }

        const creator: McpToolCreator = () => {
          const name = tool.name;
          const schema = { description: tool.description, inputSchema: tool.inputSchema };
          const handler = async (args: unknown) => await Promise.resolve(tool.handler(args));

          return [name, schema, handler];
        };

        creators.push(creator);
      }

      return creators;
    }
  }
);

/**
 * Create a single tool creator from a single tool config.
 *
 * @param {ToolConfig} config - Tool config object
 * @returns {McpToolCreator} McpToolCreator function
 */
const createMcpToolFromSingleConfig = (config: ToolConfig): McpToolCreator => () => {
  const name = config.name;
  const schema = { description: config.description, inputSchema: config.inputSchema };
  const handler = async (args: unknown) => await Promise.resolve(config.handler(args));

  return [name, schema, handler];
};

/**
 * Returns a single creator for a single tool, or an AppToolPlugin for multi-tools.
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
 * @returns {McpToolCreator | AppToolPlugin} A tool creator or application tool plugin instance based on the provided configuration.
 */
const createMcpTool = <TArgs = unknown, TResult = unknown>(
  config: ToolConfig<TArgs, TResult> | ToolConfig[] | MultiToolConfig
): McpToolCreator | AppToolPlugin => {
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

  const single = config as ToolConfig;

  // Single-tool: ToolConfig
  return createMcpToolFromSingleConfig(single);
};

export {
  createMcpTool,
  createMcpToolFromMultiToolConfig,
  createMcpToolFromSingleConfig,
  isPlugin,
  normalizeToCreators,
  pluginCreatorsToCreators,
  pluginToCreators,
  pluginToolsToCreators,
  type AppToolPlugin,
  type AppToolPluginFactory,
  type MultiToolConfig,
  type ToolConfig
};
