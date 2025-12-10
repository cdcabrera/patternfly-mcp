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
type MultiToolConfig = { name?: string; tools: ToolConfig[] };

/**
 * Returns a single creator for a single tool, or an AppToolPlugin for multi-tools.
 *
 * @Notes:
 * We accept `(args, options?)` in author handlers for forward-compat, but our runtime currently
 * invokes handlers with `(args)` only. The `options` param is provided to keep the authoring
 * surface future-proof without changing runtime behavior.
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
 * @param config
 */
const createMcpTool = <TArgs = unknown, TResult = unknown>(
  config: ToolConfig<TArgs, TResult> | ToolConfig[] | MultiToolConfig
): McpToolCreator | AppToolPlugin => {
  // Multi-tool: array of ToolConfig
  if (Array.isArray(config)) {
    const tools = config as ToolConfig[];

    return {
      createCreators: () => {
        const creators: McpToolCreator[] = [];

        for (const tool of tools) {
          if (!tool || typeof tool.handler !== 'function' || typeof tool.name !== 'string') {
            log.warn(`Skipping invalid tool: ${tool}`);
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
    } satisfies AppToolPlugin;
  }

  // Multi-tool: { tools: ToolConfig[], name? }
  if (isPlainObject(config) && Array.isArray((config as MultiToolConfig).tools)) {
    const multi = config as MultiToolConfig;

    return {
      ...(typeof multi.name === 'string' && multi.name ? { name: multi.name } : {}),
      createCreators: () => {
        const creators: McpToolCreator[] = [];

        for (const tool of multi.tools) {
          if (!tool || typeof tool.handler !== 'function' || typeof tool.name !== 'string') {
            log.warn(`Skipping invalid tool: ${tool}`);
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
    } satisfies AppToolPlugin;
  }

  // Single-tool: ToolConfig
  const single = config as ToolConfig;

  const creator: McpToolCreator = () => {
    const name = single.name;
    const schema = { description: single.description, inputSchema: single.inputSchema };
    const handler = async (args: unknown) => await Promise.resolve(single.handler(args));

    return [name, schema, handler];
  };

  return creator;
};

export {
  createMcpTool,
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
