import { spawn, type ChildProcess } from 'node:child_process';
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
  type ToolDescriptor
} from './server.toolsIpc';
import { getOptions, getSessionOptions } from './options.context';

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
 * Compute the allowlist for the Tools Host's `--allow-fs-read` flag.
 *
 * @param specs
 */
const computeFsReadAllowlist = (specs: string[]): string[] => {
  const directories = new Set<string>();

  try {
    directories.add(resolve(process.cwd()));
  } catch {}

  const req = createRequire(import.meta.url);

  for (const moduleSpec of specs) {
    try {
      const resolvedPath = req.resolve(moduleSpec, { paths: [process.cwd()] });

      directories.add(dirname(resolvedPath));
    } catch {
      try {
        directories.add(resolve(process.cwd(), moduleSpec));
      } catch {}
    }
  }

  return [...directories];
};

/**
 * Handle for a spawned Tools Host process.
 */
type HostHandle = {
  child: ChildProcess;
  tools: ToolDescriptor[];
};

/**
 * Map of active Tools Hosts per session.
 */
const activeHostsBySession = new Map<string, HostHandle>();

/**
 * Log warnings and errors from Tools' load.
 *
 * @param warningsErrors
 * @param warningsErrors.warnings
 * @param warningsErrors.errors
 */
const logWarningsErrors = ({ warnings = [], errors = [] }: { warnings?: string[], errors?: string[] } = {}) => {
  if (Array.isArray(warnings) && warnings.length > 0) {
    const warningMessage = warnings.map(warning => `  - ${warning}`);

    log.warn(`Tools load warnings (${warnings.length})\n${warningMessage.join('\n')}`);
  }

  if (Array.isArray(errors) && errors.length > 0) {
    const errorMessage = errors.map(error => `  - ${error}`);

    log.warn(`Tools load errors (${errors.length})\n${errorMessage.join('\n')}`);
  }
};

/**
 * Spawn a tools host process and return its handle.
 *
 * @param specs
 * @param isolation
 * @param {GlobalOptions} options
 */
const spawnToolsHost = async (
  specs: string[],
  isolation: 'none' | 'strict',
  options: GlobalOptions = getOptions()
): Promise<HostHandle> => {
  const { loadTimeoutMs, invokeTimeoutMs } = options.pluginHost || {};
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

  const child: ChildProcess = spawn(process.execPath, [...nodeArgs, entry], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });

  // hello
  send(child, { t: 'hello', id: makeId() });
  await awaitIpc(child, isHelloAck, loadTimeoutMs);

  // load
  const loadId = makeId();

  send(child, { t: 'load', id: loadId, specs, invokeTimeoutMs });
  const loadAck = await awaitIpc(child, isLoadAck(loadId), loadTimeoutMs);

  logWarningsErrors(loadAck);

  // manifest
  const manifestRequestId = makeId();

  send(child, { t: 'manifest:get', id: manifestRequestId });
  const manifest = await awaitIpc(child, isManifestResult(manifestRequestId), loadTimeoutMs);

  return { child, tools: manifest.tools as ToolDescriptor[] };
};

/**
 * Ensure tools are in the correct format. Recreate tool creators from a
 * loaded Tools Host.
 *
 * @param {HostHandle} handle
 * @param {GlobalOptions} options
 */
const makeProxyCreators = (handle: HostHandle, options: GlobalOptions = getOptions()): McpToolCreator[] => {
  const { invokeTimeoutMs } = options.pluginHost || {};

  return handle.tools.map((tool): McpToolCreator => () => {
    const name = tool.name;
    const schema = {
      description: tool.description,
      inputSchema: tool.inputSchema
    };

    const handler = async (args: unknown) => {
      const requestId = makeId();

      send(handle.child, { t: 'invoke', id: requestId, toolId: tool.id, args });

      const response = await awaitIpc(
        handle.child,
        isInvokeResult(requestId),
        invokeTimeoutMs
      );

      if ('ok' in response && response.ok === false) {
        const invocationError: any = new Error(response.error?.message || 'Tool invocation failed');

        invocationError.stack = response.error?.stack;
        invocationError.code = response.error?.code;
        throw invocationError;
      }

      return response.result;
    };

    return [name, schema, handler];
  });
};

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
    log.warn('External tool plugins require Node >= 22; skipping externals and continuing with built-ins.');

    return builtinCreators;
  }

  try {
    const host = await spawnToolsHost(modulePaths, isolation);
    const proxies = makeProxyCreators(host);

    // Associate the spawned host with the current session
    const { sessionId } = getSessionOptions();

    activeHostsBySession.set(sessionId, host);

    return [...builtinCreators, ...proxies];
  } catch (error) {
    log.warn('Failed to start Tools Host; skipping externals and continuing with built-ins.');
    log.warn(formatUnknownError(error));

    return builtinCreators;
  }
};

/**
 * Best-effort Tools Host shutdown for the current session.
 * Policy:
 * - Primary grace defaults to 0 ms (internal-only, from DEFAULT_OPTIONS.pluginHost.gracePeriodMs)
 * - Single fallback kill at grace + 200 ms to avoid racing simultaneous kills
 *
 * @param {GlobalOptions} options
 *  * @param [options.pluginHost.gracePeriodMs]
 */
const sendToolsHostShutdown = async (options = getOptions()): Promise<void> => {
  const { sessionId } = getSessionOptions();
  const handle = activeHostsBySession.get(sessionId);

  if (!handle) {
    return;
  }

  const { pluginHost } = options || {};
  const gracePeriodMs = (Number.isInteger(pluginHost?.gracePeriodMs) && pluginHost.gracePeriodMs) || 0;
  const fallbackGracePeriodMs = gracePeriodMs + 200;

  const child = handle.child;
  let resolved = false;
  let forceKillPrimary: NodeJS.Timeout | undefined;
  let forceKillFallback: NodeJS.Timeout | undefined;

  await new Promise<void>(resolve => {
    const resolveOnce = () => {
      if (resolved) {
        return;
      }

      resolved = true;
      child.off('exit', resolveOnce);
      child.off('disconnect', resolveOnce);

      if (forceKillPrimary) {
        clearTimeout(forceKillPrimary);
      }

      if (forceKillFallback) {
        clearTimeout(forceKillFallback);
      }

      activeHostsBySession.delete(sessionId);
      resolve();
    };

    try {
      send(child, { t: 'shutdown', id: makeId() });
    } catch {}

    const shutdownChild = () => {
      try {
        if (!child?.killed) {
          child.kill('SIGKILL');
        }
      } finally {
        resolveOnce();
      }
    };

    // Primary grace period
    forceKillPrimary = setTimeout(shutdownChild, gracePeriodMs);
    forceKillPrimary?.unref?.();

    // Fallback grace period
    forceKillFallback = setTimeout(shutdownChild, fallbackGracePeriodMs);
    forceKillFallback?.unref?.();

    child.once('exit', resolveOnce);
    child.once('disconnect', resolveOnce);
  });
};

export {
  composeToolCreators,
  getBuiltinToolCreators,
  isPlugin,
  logWarningsErrors,
  normalizeToCreators,
  pluginCreatorsToCreators,
  pluginToCreators,
  pluginToolsToCreators,
  sendToolsHostShutdown,
  type AppToolPlugin,
  type AppToolPluginFactory
};
