import { type GlobalOptions } from './options';
import { type McpTool, type McpToolCreator } from './server';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { componentSchemasTool } from './tool.componentSchemas';
import { log } from './logger';
import { isPlainObject } from './server.helpers';

/**
 * AppToolPlugin — "tools as plugins" surface.
 *
 * Implementation note:
 * - Some plugins may expose `createCreators(options)` and return `McpToolCreator[]` directly.
 * - Others may expose `createTools(options)` and return `McpTool[]`. We adapt those into creators
 *   via `pluginToolsToCreators()` with a light probe (calling with no options) to determine arity.
 */
type AppToolPlugin = {
  name?: string;
  // Optional: prefer creators if available to avoid double-construction
  createCreators?: (options?: GlobalOptions) => McpToolCreator[];
  // Optional: tools array (we'll adapt each to a creator)
  createTools?: (options?: GlobalOptions) => McpTool[];
};

type AppToolPluginFactory = (options?: GlobalOptions) => AppToolPlugin;

/**
 * Type guard for AppToolPlugin
 *
 * @param valueToCheck - Value to check
 */
const isPlugin = (valueToCheck: unknown): valueToCheck is AppToolPlugin =>
  isPlainObject(valueToCheck) && (typeof (valueToCheck as AppToolPlugin).createCreators === 'function' || typeof (valueToCheck as AppToolPlugin).createTools === 'function');

/**
 * Built-in tool creators (single source of truth for built-ins order).
 */
/**
 * Return the built-in tool creators in their canonical order.
 */
const getBuiltinToolCreators = (): McpToolCreator[] => [
  usePatternFlyDocsTool,
  fetchDocsTool,
  componentSchemasTool
];

/**
 * Adapt a plugin that exposes `createCreators()` into an array of tool creators.
 *
 * @param plugin - Plugin instance
 */
const pluginCreatorsToCreators = (plugin: AppToolPlugin): McpToolCreator[] => {
  try {
    const creators = plugin.createCreators?.();

    if (Array.isArray(creators) && creators.every(candidateFunction => typeof candidateFunction === 'function')) {
      return creators as McpToolCreator[];
    }
  } catch (error) {
    log.warn(`Plugin '${plugin.name || 'unknown'}' createCreators() failed during probe`, error);
  }

  return [];
};

/**
 * Adapt a plugin that exposes `createTools()` into one tool creator per tool.
 * We do a light probe (call with no options) to determine arity and then
 * build index-aware creators that re-call with runtime options.
 *
 * @param plugin - Plugin instance
 */
const pluginToolsToCreators = (plugin: AppToolPlugin): McpToolCreator[] => {
  let probe: McpTool[] = [];

  try {
    probe = plugin.createTools?.() || [];
  } catch (error) {
    // Probing without options may fail for some plugins; just log and continue
    log.warn(`Plugin '${plugin.name || 'unknown'}' createTools() probe failed (will still be attempted at runtime)`, error);
  }

  const count = Array.isArray(probe) ? probe.length : 0;

  // If probe yielded nothing, we still expose a single creator that will invoke createTools at runtime
  // and try to return the first tool; this keeps behavior permissive.
  const size = Math.max(1, count);

  const creators: McpToolCreator[] = Array.from({ length: size }).map((_unused, index) => (options?: GlobalOptions) => {
    const tools = plugin.createTools?.(options) || [];
    const tool = tools[index] ?? tools[0];

    if (!tool) {
      throw new Error(`Plugin '${plugin.name || 'unknown'}' did not provide a tool at index ${index}`);
    }

    return tool;
  });

  return creators;
};

/**
 * Convert any recognized plugin shape to `McpToolCreator[]`.
 *
 * @param plugin - Plugin instance
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
 * Recognized shapes (default export or named):
 * - `McpToolCreator` function
 * - `AppToolPluginFactory` (returns plugin)
 * - `AppToolPlugin` object
 * - `McpToolCreator[]`
 *
 * @param moduleExports - Imported module
 */
const normalizeToCreators = (moduleExports: any): McpToolCreator[] => {
  const candidates: any[] = [moduleExports?.default, moduleExports].filter(Boolean);

  for (const candidate of candidates) {
    // Case: already a tool creator
    if (typeof candidate === 'function') {
      try {
        const maybeTuple = (candidate as McpToolCreator)();

        if (Array.isArray(maybeTuple) && typeof maybeTuple[0] === 'string') {
          return [candidate as McpToolCreator];
        }
      } catch {
        // ignore and continue probing
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
        // ignore and continue probing
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
      if (error) {
        log.warn(String(error));
      }
    }
  }

  return creators;
};

/**
 * Compose built-in creators with any externally loaded creators.
 * Phase 1 use is internal/testing only; wiring comes in Phase 2.
 *
 * @param modulePaths - Optional array of module specs/paths to import
 */
const composeToolCreators = async (modulePaths?: string[]): Promise<McpToolCreator[]> => {
  const builtinCreators = getBuiltinToolCreators();
  const externalCreators = await loadToolCreatorsFromModules(modulePaths || []);

  return [...builtinCreators, ...externalCreators];
};

export {
  getBuiltinToolCreators,
  normalizeToCreators,
  loadToolCreatorsFromModules,
  composeToolCreators,
  type AppToolPlugin,
  type AppToolPluginFactory,
  type McpTool,
  type McpToolCreator
};
