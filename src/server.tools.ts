import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { type GlobalOptions } from './options';
import { type McpTool, type McpToolCreator } from './server';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { componentSchemasTool } from './tool.componentSchemas';
import { log, formatUnknownError } from './logger';
import { isPlainObject } from './server.helpers';
import {
  awaitIpc,
  send,
  makeId,
  isHelloAck,
  isLoadAck,
  isManifestResult,
  isInvokeResult,
  type ToolDescriptor,
  type IpcResponse
} from './server.toolsIpc';
import { getOptions } from './options.context';

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
    if (typeof candidate === 'function') {
      let result: unknown;

      try {
        // Invoke once without options to inspect the shape
        result = (candidate as () => unknown)();
      } catch (error) {
        // Ignore probe errors — we'll fall through to other shape checks
      }

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

// --- Phase 5 additions: Tools Host spawning and proxy creators ---

// Read timeouts from options at call sites (pure data)
const getPluginLoadTimeout = () => Math.max(1, getOptions().pluginHost.loadTimeoutMs);
const getPluginInvokeTimeout = () => Math.max(1, getOptions().pluginHost.invokeTimeoutMs);

const computeFsReadAllowlist = (specs: string[]): string[] => {
  const directories = new Set<string>();

  try {
    directories.add(resolve(process.cwd()));
  } catch (error) {
    // Best-effort only; ignore resolution errors for cwd
  }

  const req = createRequire(import.meta.url);

  for (const moduleSpec of specs) {
    try {
      const resolvedPath = req.resolve(moduleSpec, { paths: [process.cwd()] as any });

      directories.add(dirname(resolvedPath));
    } catch (resolveError) {
      try {
        directories.add(resolve(process.cwd(), moduleSpec));
      } catch (fallbackError) {
        // Ignore path resolution errors; allowlist remains best-effort
      }
    }
  }

  return [...directories];
};

type HostHandle = {
  child: import('node:child_process').ChildProcess;
  tools: ToolDescriptor[];
};

// Track the active Tools Host for graceful shutdown from the parent.
let activeToolsHost: HostHandle | null = null;

const spawnToolsHost = async (
  specs: string[],
  isolation: 'none' | 'strict'
): Promise<HostHandle> => {
  const nodeArgs: string[] = [];

  if (isolation === 'strict') {
    nodeArgs.push('--experimental-permission');
    const allow = computeFsReadAllowlist(specs);

    if (allow.length) {
      nodeArgs.push(`--allow-fs-read=${allow.join(',')}`);
    }
    // Deny network and fs write by omission
  }

  const req = createRequire(import.meta.url);
  const entry = req.resolve('./server.toolsHost');

  const child = spawn(process.execPath, [...nodeArgs, entry], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });

  // hello
  send(child, { t: 'hello', id: makeId() });
  await awaitIpc(child as unknown as NodeJS.Process, isHelloAck, getPluginLoadTimeout());

  // load
  const loadId = makeId();

  send(child, { t: 'load', id: loadId, specs, invokeTimeoutMs: getPluginInvokeTimeout() });
  await awaitIpc(child as any, isLoadAck(loadId), getPluginLoadTimeout());

  // manifest
  const manifestRequestId = makeId();

  send(child, { t: 'manifest:get', id: manifestRequestId });
  const manifest = await awaitIpc(child as any, isManifestResult(manifestRequestId), getPluginLoadTimeout());

  return { child, tools: (manifest as any).tools as ToolDescriptor[] };
};

const makeProxyCreators = (handle: HostHandle): McpToolCreator[] =>
  handle.tools.map((tool): McpToolCreator => () => {
    const name = tool.name;
    const schema = { description: tool.description, inputSchema: tool.inputSchema } as any;

    const handler = async (args: unknown) => {
      const requestId = makeId();

      send(handle.child, { t: 'invoke', id: requestId, toolId: tool.id, args });

      const response = await awaitIpc(
        handle.child as unknown as NodeJS.Process,
        isInvokeResult(requestId),
        getPluginInvokeTimeout()
      );

      if ('ok' in response && (response as any).ok === false) {
        const invocationError = new Error((response as any).error?.message || 'Tool invocation failed');

        (invocationError as any).stack = (response as any).error?.stack;
        (invocationError as any).code = (response as any).error?.code;
        throw invocationError;
      }

      return (response as any).result;
    };

    return [name, schema, handler];
  });

/**
 * Compose built-in creators with any externally loaded creators.
 *
 * For Node >= 22, external plugins are executed out-of-process via a Tools Host.
 * For Node < 22, externals are skipped with a warning and only built-ins are returned.
 *
 * @param modulePaths - Optional array of external module specs/paths to import
 * @param nodeMajor - Node major version, used for version gating
 * @param isolation - Isolation preset ('none' | 'strict') applied to Tools Host permissions
 * @returns {Promise<McpToolCreator[]>} Promise array of tool creators
 */
const composeToolCreators = async (
  modulePaths: string[] = getOptions().toolModules,
  nodeMajor: number = getOptions().nodeVersion,
  isolation: 'none' | 'strict' = getOptions().pluginIsolation
): Promise<McpToolCreator[]> => {
  const builtinCreators = getBuiltinToolCreators();

  if (!Array.isArray(modulePaths) || modulePaths.length === 0) {
    return builtinCreators;
  }

  if (nodeMajor < 22) {
    try {
      log.warn('External tool plugins require Node >= 22; skipping externals and continuing with built-ins.');
    } catch (loggingError) {
      // Ignore logging failures
    }

    return builtinCreators;
  }

  // Node >= 22: spawn Tools Host and proxy externals
  try {
    const host = await spawnToolsHost(modulePaths, isolation);
    const proxies = makeProxyCreators(host);
    activeToolsHost = host;

    return [...builtinCreators, ...proxies];
  } catch (error) {
    log.warn('Failed to start Tools Host; skipping externals and continuing with built-ins.');
    log.warn(formatUnknownError(error));

    return builtinCreators;
  }
};

/**
 * Best-effort shutdown of the Tools Host.
 * Sends a shutdown request, then force-kills the child after a grace period
 * if it has not exited. Timers are unref()'d so they do not keep the process alive.
 *
 * @param gracePeriodMs Grace period before forcible termination (default: 2000ms)
 */
const requestToolsHostShutdown = async (gracePeriodMs = 2000): Promise<void> => {
  const handle = activeToolsHost;
  if (!handle) {
    return;
  }

  const child = handle.child;
  let resolved = false;

  await new Promise<void>((resolve) => {
    const resolveOnce = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      child.off('exit', resolveOnce);
      child.off('disconnect', resolveOnce);
      clearTimeout(forceKillTimer as any);
      clearTimeout(forceResolveTimer as any);
      activeToolsHost = null;
      resolve();
    };

    try {
      const shutdownId = makeId();
      send(child, { t: 'shutdown', id: shutdownId });
    } catch (error) {
      // Ignore send failures; proceed to force kill after grace period.
    }

    const forceKillTimer = setTimeout(() => {
      try {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      } catch (killError) {
        // Ignore kill errors; proceed to resolve below.
      }
      const innerDelay = 250;
      const localTimer = setTimeout(() => {
        resolveOnce();
      }, innerDelay);
      if (typeof (localTimer as any).unref === 'function') {
        (localTimer as any).unref();
      }
    }, gracePeriodMs);
    if (typeof (forceKillTimer as any).unref === 'function') {
      (forceKillTimer as any).unref();
    }

    const forceResolveTimer = setTimeout(() => {
      resolveOnce();
    }, Math.max(gracePeriodMs + 1000, 1500));
    if (typeof (forceResolveTimer as any).unref === 'function') {
      (forceResolveTimer as any).unref();
    }

    child.once('exit', resolveOnce);
    child.once('disconnect', resolveOnce);
  });
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
  requestToolsHostShutdown,
  type AppToolPlugin,
  type AppToolPluginFactory
};
