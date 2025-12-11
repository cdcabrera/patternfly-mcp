import { spawn, type ChildProcess } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';
import { type AppSession, type GlobalOptions } from './options';
import { type McpToolCreator } from './server';
import { log, formatUnknownError } from './logger';
import { normalizeInputSchema } from './server.schema';
import { isPlugin, pluginToCreators } from './server.toolsCreator';
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
  closeStderr?: () => void;
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

const isStringToolModule = (module: unknown): module is string => typeof module === 'string';

const isInlineCreator = (module: unknown): module is McpToolCreator => typeof module === 'function';

/**
 * Compute the allowlist for the Tools Host's `--allow-fs-read` flag.
 *
 * @param {GlobalOptions} options
 */
const computeFsReadAllowlist = ({ toolModules, contextPath, contextUrl }: GlobalOptions = getOptions()): string[] => {
  const directories = new Set<string>();

  directories.add(contextPath);

  for (const moduleSpec of (toolModules || []).filter(isStringToolModule)) {
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
 * Debug a child process' stderr output.
 *
 * @param child - Child process to debug
 * @param {AppSession} sessionOptions
 */
const debugChild = (child: ChildProcess, { sessionId } = getSessionOptions()) => {
  const childPid = child.pid;
  const promoted = new Set<string>();

  const debugHandler = (chunk: Buffer | string) => {
    const raw = String(chunk);

    if (!raw || !raw.trim()) {
      return;
    }

    // Split multi-line chunks so each line is tagged
    const lines = raw.split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      const tagged = `[tools-host pid=${childPid} sid=${sessionId}] ${line}`;

      // Pattern: Node 22+ permission denial (FileSystemRead)
      const fsMatch = line.match(/ERR_ACCESS_DENIED.*FileSystemRead.*resource:\s*'([^']+)'/);

      if (fsMatch) {
        const resource = fsMatch[1];
        const key = `fs-deny:${resource}`;

        if (!promoted.has(key)) {
          promoted.add(key);
          log.warn(
            `Tools Host denied fs read: ${resource}. In strict mode, add its directory to --allow-fs-read.\nOptionally, you can disable strict mode entirely with pluginIsolation: 'none'.`
          );
        } else {
          log.debug(tagged);
        }
        continue;
      }

      // Pattern: ESM/CJS import issues
      if (
        /ERR_MODULE_NOT_FOUND/.test(line) ||
        /Cannot use import statement outside a module/.test(line) ||
        /ERR_UNKNOWN_FILE_EXTENSION/.test(line)
      ) {
        const key = `esm:${line}`;

        if (!promoted.has(key)) {
          promoted.add(key);
          log.warn('Tools Host import error. Ensure external tools are ESM (no raw .ts) and resolvable.\nFor local files, prefer a file:// URL.');
        } else {
          log.debug(tagged);
        }
        continue;
      }

      // Default: debug-level passthrough
      log.debug(tagged);
    }
  };

  child.stderr?.on('data', debugHandler);

  return () => {
    try {
      child.stderr?.off('data', debugHandler);
    } catch {}
  };
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
  toolModules.filter(isStringToolModule).map(tool => {
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

    // 1) Gather directories (project, plugin modules, and the host entry's dir)
    const allowSet = new Set<string>(computeFsReadAllowlist());

    allowSet.add(dirname(updatedEntry));

    // 2) Normalize to real absolute paths to avoid symlink mismatches
    // Using top-level import instead of dynamic import for better performance
    const allowList = [...allowSet]
      .map(dir => {
        try {
          return realpathSync(dir);
        } catch {
          return dir;
        }
      })
      .filter(Boolean);

    // 3) Pass one --allow-fs-read per directory (more robust than a single comma-separated flag)
    for (const dir of allowList) {
      nodeArgs.push(`--allow-fs-read=${dir}`);
    }

    // Optional debug to verify exactly what the child gets
    log.debug(`Tools Host allow-fs-read flags: ${allowList.map(dir => `--allow-fs-read=${dir}`).join(' ')}`);
  }

  // Pre-compute normalized tool modules before spawning to reduce latency
  const normalizedToolModules = normalizeToolModules();

  const child: ChildProcess = spawn(process.execPath, [...nodeArgs, updatedEntry], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  });

  const closeStderr = debugChild(child);

  // hello
  send(child, { t: 'hello', id: makeId() });
  await awaitIpc(child, isHelloAck, loadTimeoutMs);

  // load
  const loadId = makeId();

  send(child, { t: 'load', id: loadId, specs: normalizedToolModules, invokeTimeoutMs });
  const loadAck = await awaitIpc(child, isLoadAck(loadId), loadTimeoutMs);

  logWarningsErrors(loadAck);

  // manifest
  const manifestRequestId = makeId();

  send(child, { t: 'manifest:get', id: manifestRequestId });
  const manifest = await awaitIpc(child, isManifestResult(manifestRequestId), loadTimeoutMs);

  return { child, tools: manifest.tools as ToolDescriptor[], closeStderr };
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
  // Normalize the schema in case it's a plain JSON Schema that was serialized through IPC
  const normalizedSchema = normalizeInputSchema(tool.inputSchema);
  const schema = {
    description: tool.description,
    inputSchema: normalizedSchema
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
 * - Close logging for child(ren) stderr
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

      try {
        handle.closeStderr?.();
      } catch {}

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

// Inline schema normalization wrapper
const wrapCreatorWithNormalization = (creator: McpToolCreator): McpToolCreator => options => {
  const [name, schema, cb] = creator(options);
  const original = schema?.inputSchema;
  const normalized = normalizeInputSchema(original);

  if (normalized !== original) {
    log.info(`Inline tool "${name}" input schema converted from JSON→Zod`);
  }

  return [name, { ...schema, inputSchema: normalized }, cb];
};

const getToolName = (creator: McpToolCreator): string | undefined => {
  try {
    return creator()?.[0];
  } catch {
    return undefined;
  }
};

const wrapCreatorWithNameGuard = (creator: McpToolCreator, usedNames: Set<string>): McpToolCreator | null => {
  const name = getToolName(creator);

  if (!name) {
    return creator;
  }

  if (usedNames.has(name)) {
    log.warn(`Skipping inline tool "${name}" because a tool with the same name is already provided (built-in or earlier).`);

    return null;
  }

  usedNames.add(name);

  return creator;
};

/**
 * Compose built-in creators with any externally loaded creators.
 *
 * - Node.js version policy:
 *    - Node >= 22, external plugins are executed out-of-process via a Tools Host.
 *    - Node < 22, externals are skipped with a warning and only built-ins are returned.
 * - Registry is self‑healing for pre‑load or mid‑run crashes without changing normal shutdown
 *
 * @param builtinCreators - Built-in tool creators
 * @param {GlobalOptions} [options]
 * @param options.toolModules
 * @param options.nodeVersion
 * @param {AppSession} [sessionOptions]
 * @returns {Promise<McpToolCreator[]>} Promise array of tool creators
 */
const composeTools = async (
  builtinCreators: McpToolCreator[],
  { toolModules, nodeVersion }: GlobalOptions = getOptions(),
  { sessionId }: AppSession = getSessionOptions()
): Promise<McpToolCreator[]> => {
  const result: McpToolCreator[] = [];

  // 1) Seed with built-ins and reserve names
  const usedNames = new Set<string>(builtinCreators.map(creator => getToolName(creator)).filter(Boolean) as string[]);

  result.push(...builtinCreators);

  if (!Array.isArray(toolModules) || toolModules.length === 0) {
    return result;
  }

  // 2) Partition modules
  const inlineModules: McpToolCreator[] = [];
  const fileSpecs: string[] = [];

  for (const mod of toolModules) {
    if (isStringToolModule(mod)) {
      fileSpecs.push(mod);
    } else if (isInlineCreator(mod)) {
      inlineModules.push(mod);
    } else if (isPlugin(mod)) {
      inlineModules.push(...pluginToCreators(mod));
    } else {
      log.warn(`Unknown tool module type: ${typeof mod}`);
    }
  }

  // 3) Normalize + name-guard inline creators
  for (const creator of inlineModules) {
    const normalized = wrapCreatorWithNormalization(creator as McpToolCreator);
    const guarded = wrapCreatorWithNameGuard(normalized, usedNames);

    if (guarded) {
      result.push(guarded);
    }
  }

  // 4) Load file-based via Tools Host (Node gate applies only here)
  if (fileSpecs.length === 0) {
    return result;
  }

  if (nodeVersion < 22) {
    log.warn('External tool plugins require Node >= 22; skipping file-based tools.');

    return result;
  }

  try {
    const host = await spawnToolsHost();

    // Filter manifest by reserved names BEFORE proxying
    const filteredTools = host.tools.filter(tool => {
      if (usedNames.has(tool.name)) {
        log.warn(`Skipping plugin tool "${tool.name}" – name already used by built-in/inline tool.`);

        return false;
      }
      usedNames.add(tool.name);

      return true;
    });

    const filteredHandle = { ...host, tools: filteredTools } as HostHandle;
    const proxies = makeProxyCreators(filteredHandle);

    // Associate the spawned host with the current session
    activeHostsBySession.set(sessionId, host);

    // Clean up on exit or disconnect
    const onChildExitOrDisconnect = () => {
      const current = activeHostsBySession.get(sessionId);

      if (current && current.child === host.child) {
        try {
          host.closeStderr?.();
        } catch {}
        activeHostsBySession.delete(sessionId);
      }
      host.child.off('exit', onChildExitOrDisconnect);
      host.child.off('disconnect', onChildExitOrDisconnect);
    };

    host.child.once('exit', onChildExitOrDisconnect);
    host.child.once('disconnect', onChildExitOrDisconnect);

    return [...result, ...proxies];
  } catch (error) {
    log.warn('Failed to start Tools Host; skipping externals and continuing with built-ins/inline.');
    log.warn(formatUnknownError(error));

    return result;
  }
};

export {
  composeTools,
  computeFsReadAllowlist,
  debugChild,
  isFilePath,
  isUrlLike,
  logWarningsErrors,
  makeProxyCreators,
  normalizeToolModules,
  sendToolsHostShutdown,
  spawnToolsHost
};
