import { z } from 'zod';
import { spawn, type ChildProcess } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, isAbsolute, resolve } from 'node:path';
import { type AppSession, type GlobalOptions } from './options';
import { type McpToolCreator } from './server';
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
/**
 * Check if a value is a Zod schema (v3 or v4).
 *
 * @param value - Value to check
 * @returns `true` if the value appears to be a Zod schema
 */
const isZodSchema = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  // Zod v3 has _def property
  // Zod v4 has _zod property
  // Zod schemas have parse/safeParse methods
  return (
    ('_def' in obj && obj._def !== undefined) ||
    ('_zod' in obj && obj._zod !== undefined) ||
    (typeof obj.parse === 'function') ||
    (typeof obj.safeParse === 'function') ||
    (typeof obj.safeParseAsync === 'function')
  );
};

/**
 * Check if a value is a ZodRawShapeCompat (object with Zod schemas as values).
 *
 * @param value - Value to check
 * @returns `true` if the value appears to be a ZodRawShapeCompat
 */
const isZodRawShape = (value: unknown): boolean => {
  if (!isPlainObject(value)) {
    return false;
  }

  const obj = value as Record<string, unknown>;
  const values = Object.values(obj);

  // Empty object is not a shape
  if (values.length === 0) {
    return false;
  }

  // All values must be Zod schemas
  return values.every(v => isZodSchema(v));
};

/**
 * Convert a plain JSON Schema object to a Zod schema.
 * For simple cases, converts to appropriate Zod schemas.
 * For complex cases, falls back to z.any() to accept any input.
 *
 * @param jsonSchema - Plain JSON Schema object
 * @returns Zod schema equivalent
 */
const jsonSchemaToZod = (jsonSchema: unknown): z.ZodTypeAny => {
  if (!isPlainObject(jsonSchema)) {
    return z.any();
  }

  const schema = jsonSchema as Record<string, unknown>;

  // Handle object type schemas
  if (schema.type === 'object') {
    // If additionalProperties is true, allow any properties
    if (schema.additionalProperties === true || schema.additionalProperties === undefined) {
      // If there are no required properties, use passthrough to allow any object
      if (!schema.properties || (isPlainObject(schema.properties) && Object.keys(schema.properties).length === 0)) {
        return z.object({}).passthrough();
      }

      // If there are properties, we'd need to convert them, but for now use passthrough
      // This is a simplified conversion - full JSON Schema to Zod conversion would be more complex
      return z.object({}).passthrough();
    }

    // If additionalProperties is false, use strict object
    return z.object({}).strict();
  }

  // For other types, fall back to z.any()
  // A full implementation would handle array, string, number, boolean, etc.
  return z.any();
};

/**
 * Normalize an inputSchema to a format compatible with MCP SDK.
 * If it's already a Zod schema or ZodRawShapeCompat, return as-is.
 * If it's a plain JSON Schema, convert it to a Zod schema.
 *
 * @param inputSchema - Input schema (Zod schema, ZodRawShapeCompat, or plain JSON Schema)
 * @returns Normalized schema compatible with MCP SDK
 */
const normalizeInputSchema = (inputSchema: unknown): unknown => {
  // If it's already a Zod schema, return as-is
  if (isZodSchema(inputSchema)) {
    return inputSchema;
  }

  // If it's a ZodRawShapeCompat (object with Zod schemas as values), return as-is
  if (isZodRawShape(inputSchema)) {
    return inputSchema;
  }

  // If it's a plain JSON Schema object, convert to Zod
  if (isPlainObject(inputSchema)) {
    return jsonSchemaToZod(inputSchema);
  }

  // Fallback: return as-is (might be undefined or other types)
  return inputSchema;
};

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
        try {
          // Close child stderr to avoid leaks
          host.closeStderr?.();
        } catch {}
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
