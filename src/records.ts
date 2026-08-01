import { type ChildProcess } from 'node:child_process';
import { type AppSession, type GlobalOptions } from './options';
import { log } from './logger.js';
import { getOptions, getSessionOptions } from './options.context.js';
import {
  spawnChildProcess,
  shutdownChildProcess,
  activeChildrenBySession,
  type ChildHandle
} from './server.process.js';
// import { spawnApiHost, sendApiHostShutdown, type HostHandle } from './records.patternFly.js';

type HostHandle = ChildHandle & {
  manifest: Array<{ name: string; description?: string }>;
};

/**
 * Record schema.
 *
 * @interface Record
 *
 * @property sourceId - Source identifier (e.g., combo of git-hash + file path, or crawler endpoint)
 * @property sourceType - Source type classification
 * @property id - Unique id for the record
 */
interface Record {
  sourceId: string;
  sourceType: 'git' | 'api' | 'local';
  id: string;
  [customField: string]: unknown;
}

/**
 * Standard callback return structure for records collection.
 *
 * @interface RecordCollectionResult
 *
 * @property records - Array of records
 * @property warnings - Optional array of warnings
 * @property errors - Optional array of errors
 */
interface RecordCollectionResult {
  records: Record[];
  warnings?: string[];
  errors?: string[];
}

/**
 * Standardized Tuple-based Record Source.
 *
 * 0. `name` `{string}`: Unique identifier/name
 * 1. `handler` `{Function}`: callback function accepting an optional argument
 * 2. `_config` `{Object}`: Record source configuration.
 *    - `_config.runInChildProcess`: Optional callback function to dynamically decide
 *        if the record source should run in a child process.
 */
type RecordSource = [
  name: string,
  handler: (arg?: unknown) => RecordCollectionResult | Promise<RecordCollectionResult>,
  _config?: {
    runInChildProcess?: (options: GlobalOptions) => boolean | Promise<boolean>;
  }
];

/**
 * Log warnings and errors from Tools' load.
 *
 * @param warningsErrors - Object containing warnings and errors
 * @param warningsErrors.warnings - Log warnings
 * @param warningsErrors.errors - Log errors
 */
const logWarningsErrors = ({ warnings = [], errors = [] }: { warnings?: string[], errors?: string[] } = {}) => {
  if (Array.isArray(warnings) && warnings.length > 0) {
    const lines = warnings.map(warning => `  - ${String(warning)}`);

    log.warn(`Records load warnings (${warnings.length})\n${lines.join('\n')}`);
  }

  if (Array.isArray(errors) && errors.length > 0) {
    const lines = errors.map(error => `  - ${String(error)}`);

    log.error(`Records load errors (${errors.length})\n${lines.join('\n')}`);
  }
};

/**
 * Debug a child process' stderr output.
 *
 * @param child - Child process to debug
 * @param {AppSession} sessionOptions - Session options
 */
const debugChild = (child: ChildProcess, { sessionId } = getSessionOptions()) => {
  const childPid = child.pid;

  const debugHandler = (chunk: Buffer | string) => {
    const raw = String(chunk);

    if (!raw || !raw.trim()) {
      return;
    }

    // Split multi-line chunks so each line is tagged
    const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    for (const line of lines) {
      const tagged = `[patternFly-host pid=${childPid} sid=${sessionId}] ${line}`;

      // Default: debug-level passthrough
      log.debug(tagged);
    }
  };

  child.stderr?.on?.('data', debugHandler);

  return () => {
    child.stderr?.off?.('data', debugHandler);
  };
};

const spawnRecordsHost = async (
  options: GlobalOptions = getOptions()
): Promise<HostHandle> => {
  const { pluginIsolation, pluginHost, nodeVersion } = options || {};
  const { loadTimeoutMs } = pluginHost || {};

  const handle = spawnChildProcess({
    importSpecifier: '#recordsHost',
    label: 'PatternFly API Host',
    isolation: {
      mode: pluginIsolation === 'strict' ? 'strict' : 'none',
      nodeVersion,
      fsReadAllowlist: []
    }
  });

  await handle.request({ t: 'hello' }, 'hello:ack', loadTimeoutMs);
  await handle.request({ t: 'load', specs: [], invokeTimeoutMs: loadTimeoutMs }, 'load:ack', loadTimeoutMs);
  const manifest = await handle.request<any>({ t: 'manifest:get' }, 'manifest:result', loadTimeoutMs);

  return { ...handle, manifest: manifest.tools ?? [] };
};

/**
 * Dynamically proxies a remote child-process record callback across the IPC boundary.
 *
 * @param sourceName
 * @param handle
 * @param globalOpts
 */
const makeProxyRecordsHandler = (
  sourceName: string,
  handle: HostHandle,
  globalOpts: GlobalOptions
): (arg?: unknown) => Promise<RecordCollectionResult> => {
  const invokeTimeoutMs = Math.max(0, Number(globalOpts.pluginHost?.invokeTimeoutMs) || 0);

  return async arg => {
    try {
      const response = await handle.request<any>(
        {
          t: 'invoke',
          toolId: 'crawl',
          args: { sourceName, arg }
        },
        'invoke:result',
        invokeTimeoutMs
      );

      if (response.ok) {
        return {
          records: response.result?.records || [],
          warnings: response.result?.warnings || [],
          errors: response.result?.errors || []
        };
      } else {
        return {
          records: [],
          errors: [response.error?.message || `Proxy call failed for ${sourceName}`]
        };
      }
    } catch (err) {
      return {
        records: [],
        errors: [`Proxy connection failed for ${sourceName}: ${err instanceof Error ? err.message : String(err)}`]
      };
    }
  };
};

/**
 * Best-effort Tools Host shutdown for the current session.
 *
 * Policy:
 * - Primary grace defaults to 0 ms (internal-only, from DEFAULT_OPTIONS.pluginHost.gracePeriodMs)
 * - Single fallback kill at grace + 200 ms to avoid racing simultaneous kills
 * - Close logging for child(ren) stderr
 *
 * @param {GlobalOptions} options - Global options.
 * @param {AppSession} sessionOptions - Session options.
 */
const sendRecordsHostShutdown = async (
  { pluginHost }: GlobalOptions = getOptions(),
  { sessionId }: AppSession = getSessionOptions()
): Promise<void> => {
  const handle = activeChildrenBySession.get(sessionId) as HostHandle | undefined;

  await shutdownChildProcess(handle, {
    gracePeriodMs: Math.max(0, Number(pluginHost?.gracePeriodMs) || 0),
    sessionId,
    label: 'Records Host'
  });
};

/**
 * Composes multi-source record collections across process boundaries.
 *
 * @param sources
 * @param options
 */
const composeRecords = async (
  sources: RecordSource[],
  options: GlobalOptions = getOptions()
): Promise<RecordCollectionResult> => {
  const records: Record[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const inProcess: RecordSource[] = [];
  const outOfProcess: RecordSource[] = [];

  // Segment based on dynamic execution boundary check
  for (const source of sources) {
    const [, , config] = source;
    const runRemote = config?.runInChildProcess ? await config.runInChildProcess(options) : false;

    if (runRemote) {
      outOfProcess.push(source);
    } else {
      inProcess.push(source);
    }
  }

  // 1. Run local / in-process callbacks directly
  for (const [name, handler] of inProcess) {
    try {
      const result = await handler();

      if (result.records) {
        records.push(...result.records);
      }

      if (result.warnings) {
        warnings.push(...result.warnings);
      }

      if (result.errors) {
        errors.push(...result.errors);
      }
    } catch (err) {
      errors.push(`Local source [${name}] failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Spawn records host dynamically ONLY if remote runs are required
  if (outOfProcess.length > 0) {
    let handle: HostHandle | undefined;

    try {
      handle = await spawnRecordsHost(options);

      for (const [name] of outOfProcess) {
        try {
          const remoteProxy = makeProxyRecordsHandler(name, handle, options);
          const result = await remoteProxy();

          if (result.records) {
            records.push(...result.records);
          }

          if (result.warnings) {
            warnings.push(...result.warnings);
          }

          if (result.errors) {
            errors.push(...result.errors);
          }
        } catch (err) {
          errors.push(`Remote source [${name}] failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (spawnError) {
      errors.push(`Failed to spin up process host: ${spawnError instanceof Error ? spawnError.message : String(spawnError)}`);
    } finally {
      if (handle) {
        await sendRecordsHostShutdown(options).catch(err =>
          log.warn(`shutdown after compose failed: ${err instanceof Error ? err.message : String(err)}`));
      }
    }
  }

  return { records, warnings, errors };
};

export {
  composeRecords,
  debugChild,
  logWarningsErrors,
  makeProxyRecordsHandler,
  type Record,
  type RecordCollectionResult,
  type RecordSource
};
