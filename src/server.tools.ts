import { type GlobalOptions } from './options';
import { type McpTool, type McpToolCreator } from './server';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { componentSchemasTool } from './tool.componentSchemas';
import { log, formatUnknownError } from './logger';
import { isPlainObject } from './server.helpers';

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

type AppToolPluginFactory = (options?: GlobalOptions) => AppToolPlugin;

/**
 * Built-in tool creators.
 *
 * @returns Array of built-in tool creators
 */
const getBuiltinToolCreators = (): McpToolCreator[] => [
  usePatternFlyDocsTool,
  fetchDocsTool,
  componentSchemasTool
];

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
    log.warn(`Plugin '${plugin.name || 'unknown'}' createCreators() failed`, error);
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
      `Plugin '${plugin.name || 'unknown'}' createTools() check failed (will still be attempted at runtime)`,
      error
    );
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
  // Prefer creators when available

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
    // Case: already a tool creator
    if (typeof candidate === 'function') {
      try {
        const maybeTuple = (candidate as McpToolCreator)();

        if (Array.isArray(maybeTuple) && typeof maybeTuple[0] === 'string') {
          return [candidate as McpToolCreator];
        }
      } catch {
        // ignore and continue
      }
    }

    // Case: plugin factory function
    if (typeof candidate === 'function') {
      try {
        const maybePlugin = (candidate as AppToolPluginFactory)();

        if (isPlugin(maybePlugin)) {
          const creators = pluginToCreators(maybePlugin);

          if (creators.length) {
            return creators;
          }
        }
      } catch {
        // ignore and continue
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
 * Dynamic import a list of module specs/paths and normalize each into creators.
 *
 * @param paths - Array of module specs/paths to import
 * @returns {Promise<McpToolCreator[]>} Promise array of tool creators
 */
const loadToolCreatorsFromModules = async (paths: string[] = []): Promise<McpToolCreator[]> => {
  const creators: McpToolCreator[] = [];

  for (const modulePath of paths) {
    const moduleSpecifier = String(modulePath).trim();

    if (!moduleSpecifier) {
      continue;
    }

    try {
      const importedModule = await import(moduleSpecifier);
      const normalizedCreators = normalizeToCreators(importedModule);

      if (!normalizedCreators.length) {
        log.warn(`No tool creators found in module: ${moduleSpecifier}`);
      } else {
        creators.push(...normalizedCreators);
      }
    } catch (error) {
      log.warn(`Failed to import tool module: ${moduleSpecifier}`);
      log.warn(formatUnknownError(error));
    }
  }

  return creators;
};

/**
 * Compose built-in creators with any externally loaded creators.
 *
 * @param modulePaths - Optional array of module specs/paths to import
 * @returns {Promise<McpToolCreator[]>} Promise array of tool creators
 */
const composeToolCreators = async (modulePaths?: string[]): Promise<McpToolCreator[]> => {
  const builtinCreators = getBuiltinToolCreators();
  const externalCreators = await loadToolCreatorsFromModules(modulePaths || []);

  return [...builtinCreators, ...externalCreators];
};

export {
  composeToolCreators,
  getBuiltinToolCreators,
  isPlugin,
  loadToolCreatorsFromModules,
  normalizeToCreators,
  pluginCreatorsToCreators,
  pluginToCreators,
  pluginToolsToCreators,
  type AppToolPlugin,
  type AppToolPluginFactory
};
