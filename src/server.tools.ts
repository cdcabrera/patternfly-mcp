import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';
import { type AppSession, type GlobalOptions } from './options';
import { type McpToolCreator } from './server';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { componentSchemasTool } from './tool.componentSchemas';
import { log, formatUnknownError } from './logger';
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
 * Check if a string looks like a file path.
 *
 * @param str
 * @returns Confirmation that the string looks like a file path.
 */
const isFilePath = (str: string): boolean =>
  str.startsWith('./') || str.startsWith('../') || str.startsWith('/') || /^[A-Za-z]:[\\/]/.test(str);

/**
 * Check if a string looks like a URL.
 *
 * @param str
 * @returns Confirmation that the string looks like a URL.
 */
const isUrlLike = (str: string) =>
  /^(file:|https?:|data:|node:)/i.test(str);

/**
 * Built-in tools.
 *
 * @returns Array of built-in tools
 */
const getBuiltinTools = (): McpToolCreator[] => [
  usePatternFlyDocsTool,
  fetchDocsTool,
  componentSchemasTool
];

/**
 * Compute the allowlist for the Tools Host's `--allow-fs-read` flag.
 *
 * @param {GlobalOptions} options
 */
const computeFsReadAllowlist = ({ toolModules, contextPath, contextUrl }: GlobalOptions = getOptions()): string[] => {
  const directories = new Set<string>();

  directories.add(contextPath);

  for (const moduleSpec of toolModules) {
    try {
      const url = import.meta.resolve(moduleSpec, contextUrl);

      if (url.startsWith('file:')) {
        const resolvedPath = fileURLToPath(url);

        directories.add(dirname(resolvedPath));
      }
    } catch {
      if (isFilePath(moduleSpec)) {
        try {
          const resolvedPath = resolve(contextPath, moduleSpec);

          directories.add(dirname(resolvedPath));
        } catch (error) {
          log.debug(`Failed to resolve module spec; skipping ${moduleSpec} ${formatUnknownError(error)}`);
        }
      }
    }
  }

  return [...directories];
};

/**
 * Log warnings and errors from Tools' load.
 *
 * @param warningsErrors
 * @param warningsErrors.warnings
 * @param warningsErrors.errors
 */
const logWarningsErrors = ({ warnings = [], errors = [] }: { warnings?: string[], errors?: string[] } = {}) => {
  if (Array.isArray(warnings) && warnings.length > 0) {
    const lines = warnings.map(warning => `  - ${String(warning)}`);

    log.warn(`Tools load warnings (${warnings.length})\n${lines.join('\n')}`);
  }

  if (Array.isArray(errors) && errors.length > 0) {
    const lines = errors.map(error => `  - ${String(error)}`);

    log.warn(`Tools load errors (${errors.length})\n${lines.join('\n')}`);
  }
};

/**
 * Normalize tool modules to URLs.
 *
 * Check a variety of formats just to normalize. Attempting to pass
 * `http` or `data` formats will log an error.
 *
 * @param {GlobalOptions} options
 * @returns Updated array of normalized tool modules
 */
const normalizeToolModules = ({ contextPath, toolModules }: GlobalOptions = getOptions()): string[] =>
  toolModules.map(tool => {
    if (isUrlLike(tool)) {
      return tool;
    }

    // pass through URLs and node: imports
    if (isFilePath(tool)) {
      const abs = isAbsolute(tool) ? tool : resolve(contextPath, tool);

      return pathToFileURL(abs).href;
    }

    return tool; // package name
  });

/**
 * Spawn a tools host process and return its handle.
 *
 * - See `package.json` import path for entry parameter.
 *
 * @param {GlobalOptions} options
 */
const spawnToolsHost = async (
  { pluginIsolation, pluginHost }: GlobalOptions = getOptions()
): Promise<HostHandle> => {
  const { loadTimeoutMs, invokeTimeoutMs } = pluginHost || {};
  const nodeArgs: string[] = [];
  let updatedEntry: string;

  try {
    const entryUrl = import.meta.resolve('#toolsHost');

    updatedEntry = fileURLToPath(entryUrl);
  } catch (error) {
    log.debug(`Failed to resolve Tools Host entry: ${formatUnknownError(error)}`);

    throw new Error(
      `Failed to resolve Tools Host entry '#toolsHost' from package imports: ${formatUnknownError(error)}`
    );
  }

  // Deny network and fs write by omission
  if (pluginIsolation === 'strict') {
    nodeArgs.push('--experimental-permission');
    const allowDirs = new Set<string>(computeFsReadAllowlist());

    allowDirs.add(dirname(updatedEntry));

    nodeArgs.push(`--allow-fs-read=${[...allowDirs].join(',')}`);
  }

  const child: ChildProcess = spawn(process.execPath, [...nodeArgs, updatedEntry], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });

  // hello
  send(child, { t: 'hello', id: makeId() });
  await awaitIpc(child, isHelloAck, loadTimeoutMs);

  // load
  const loadId = makeId();
  const normalizedToolModules = normalizeToolModules();

  send(child, { t: 'load', id: loadId, specs: normalizedToolModules, invokeTimeoutMs });
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
const makeProxyCreators = (
  handle: HostHandle,
  { pluginHost }: GlobalOptions = getOptions()
): McpToolCreator[] => handle.tools.map((tool): McpToolCreator => () => {
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
      pluginHost.invokeTimeoutMs
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

/**
 * Best-effort Tools Host shutdown for the current session.
 * Policy:
 * - Primary grace defaults to 0 ms (internal-only, from DEFAULT_OPTIONS.pluginHost.gracePeriodMs)
 * - Single fallback kill at grace + 200 ms to avoid racing simultaneous kills
 *
 * @param {GlobalOptions} options
 * @param options.pluginHost
 * @param {AppSession} sessionOptions
 * @param sessionOptions.sessionId
 */
const sendToolsHostShutdown = async (
  { pluginHost }: GlobalOptions = getOptions(),
  { sessionId }: AppSession = getSessionOptions()
): Promise<void> => {
  const handle = activeHostsBySession.get(sessionId);

  if (!handle) {
    return;
  }

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

/**
 * Compose built-in creators with any externally loaded creators.
 *
 * - Node.js version policy:
 *    - Node >= 22, external plugins are executed out-of-process via a Tools Host.
 *    - Node < 22, externals are skipped with a warning and only built-ins are returned.
 * - Registry is self‑healing for pre‑load or mid‑run crashes without changing normal shutdown
 *
 * @param {GlobalOptions} options
 * @param options.toolModules
 * @param options.nodeVersion
 * @param {AppSession} sessionOptions
 * @returns {Promise<McpToolCreator[]>} Promise array of tool creators
 */
const composeTools = async (
  { toolModules, nodeVersion }: GlobalOptions = getOptions(),
  { sessionId }: AppSession = getSessionOptions()
): Promise<McpToolCreator[]> => {
  const builtinCreators = getBuiltinTools();

  if (!Array.isArray(toolModules) || toolModules.length === 0) {
    return builtinCreators;
  }

  if (nodeVersion < 22) {
    log.warn('External tool plugins require Node >= 22; skipping externals and continuing with built-ins.');

    return builtinCreators;
  }

  try {
    const host = await spawnToolsHost();
    const proxies = makeProxyCreators(host);

    // Associate the spawned host with the current session
    activeHostsBySession.set(sessionId, host);

    // Clean up on exit or disconnect
    const onChildExitOrDisconnect = () => {
      const current = activeHostsBySession.get(sessionId);

      // Remove only if this exact child is still the active one for the session
      if (current && current.child === host.child) {
        activeHostsBySession.delete(sessionId);
      }

      // Clean up listeners; we only need to act once
      host.child.off('exit', onChildExitOrDisconnect);
      host.child.off('disconnect', onChildExitOrDisconnect);
    };

    host.child.once('exit', onChildExitOrDisconnect);
    host.child.once('disconnect', onChildExitOrDisconnect);

    return [...builtinCreators, ...proxies];
  } catch (error) {
    log.warn('Failed to start Tools Host; skipping externals and continuing with built-ins.');
    log.warn(formatUnknownError(error));

    return builtinCreators;
  }
};

export {
  composeTools,
  getBuiltinTools,
  logWarningsErrors,
  normalizeToolModules,
  sendToolsHostShutdown
};
