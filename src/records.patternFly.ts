import { type ChildProcess } from 'node:child_process';
import { log, formatUnknownError } from './logger.js';
import { getOptions, getSessionOptions } from './options.context.js';
import type { AppSession, GlobalOptions } from './options.js';
import { type IpcResponse } from './records.patternFlyIpc';
import {
  spawnChildProcess,
  shutdownChildProcess,
  activeChildrenBySession,
  type ChildHandle
} from './server.process.js';
import { timeoutFunction } from './server.helpers';
import { isEmptyPayload } from './records.patternFlyApi.js';
import type { SourceRecord, RecordsSource } from './records.js';

/**
 * Handle to a child instance with an associated manifest that defines invokable operations.
 *
 * @typedef {ChildHandle & Object} HostHandle
 * @property manifest - Manifest returned by the child; today: single 'crawl' invokable.
 */
type HostHandle = ChildHandle & {
  manifest: Array<{ name: string; description?: string }>;
};

interface CrawlRequest {
  versions?: string[];
  componentPaths?: string[];
  concurrency?: number;
}

interface CrawlResult {
  content: Array<{ key: string; version?: string; url?: string; props?: unknown; css?: unknown; content?: unknown }>;
  warnings: string[];
  errors: string[];
}

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

    log.warn(`PatternFly source load warnings (${warnings.length})\n${lines.join('\n')}`);
  }

  if (Array.isArray(errors) && errors.length > 0) {
    const lines = errors.map(error => `  - ${String(error)}`);

    log.error(`PatternFly source load errors (${errors.length})\n${lines.join('\n')}`);
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
  // const promoted = new Set<string>();

  const debugHandler = (chunk: Buffer | string) => {
    const raw = String(chunk);

    if (!raw || !raw.trim()) {
      return;
    }

    // Split multi-line chunks so each line is tagged
    const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    for (const line of lines) {
      const tagged = `[patternFly-host pid=${childPid} sid=${sessionId}] ${line}`;

      /*
      // Pattern: fs read issues
      if (
        /ERR_ACCESS_DENIED.*FileSystemRead.*resource:\s* /i.test(line) ||
        /ERR_ACCESS_DENIED.*Read/i.test(line)
      ) {
        const key = `fs-deny:${line}`;

        if (!promoted.has(key)) {
          promoted.add(key);
          log.warn(
            `${line}\nPatternFly Host denied fs read. In strict mode, add
            the resource's directory to --allow-fs-read.\nOptionally, you can disable strict mode entirely with pluginIsolation: 'none'.`
          );

          continue;
        }
      }*/

      // Pattern: ESM/CJS import issues
      /*
      if (
        /ERR_MODULE_NOT_FOUND/.test(line) ||
        /Cannot use import statement outside a module/i.test(line) ||
        /ERR_UNKNOWN_FILE_EXTENSION/.test(line)
      ) {
        const key = `esm:${line}`;

        if (!promoted.has(key)) {
          promoted.add(key);
          log.warn('PatternFly Host import error. Ensure resources are ESM (no raw .ts) and resolvable.\nFor local files, prefer a file:// URL.');

          continue;
        }
      }
      */

      // Default: debug-level passthrough
      log.debug(tagged);
    }
  };

  child.stderr?.on?.('data', debugHandler);

  return () => {
    child.stderr?.off?.('data', debugHandler);
  };
};

/**
 * Spawn the PatternFly API Host (child process), HELLO/LOAD/MANIFEST handshake,
 * and return a host handle. Mirrors server.tools.ts::spawnToolsHost.
 *
 * @param options
 */
const spawnPatternFlyHost = async (
  options: GlobalOptions = getOptions()
): Promise<HostHandle> => {
  const { pluginIsolation, pluginHost, nodeVersion } = options || {};
  const { loadTimeoutMs } = pluginHost || {};

  const handle = spawnChildProcess({
    importSpecifier: '#patternFlyHost',
    label: 'PatternFly Host',
    isolation: {
      mode: pluginIsolation === 'strict' ? 'strict' : 'none',
      nodeVersion,
      fsReadAllowlist: [] // crawler is network-only
    },
    enableStderrDebug: child => debugChild(child)
  });

  // hello
  await handle.request({ t: 'hello' }, 'hello:ack', loadTimeoutMs);

  // load
  const loadAck = await handle.request<Extract<IpcResponse, { t: 'load:ack' }>>(
    { t: 'load', specs: [], invokeTimeoutMs: loadTimeoutMs },
    'load:ack',
    loadTimeoutMs
  );

  logWarningsErrors(loadAck);

  // manifest
  const manifest = await handle.request<Extract<IpcResponse, { t: 'manifest:result' }>>(
    { t: 'manifest:get' },
    'manifest:result',
    loadTimeoutMs
  );

  // This shouldn't be "manifest.tools" that's a representation of the toolsHost set up not patternfly sources and their data.
  return { ...handle, manifest: manifest.tools ?? [] };
  // return { ...handle, manifest: manifest.sources ?? [] };
};

/**
 * Send INVOKE(crawl) to the host, bounded by patternflyOptions.api.crawlTimeoutMs.
 *
 * @param handle
 * @param request
 * @param options
 */
const runPatternFlyApiCrawl = async (
  handle: HostHandle,
  request: CrawlRequest = {},
  options: GlobalOptions = getOptions()
): Promise<CrawlResult> => {
  const invokeTimeoutMs = options.pluginHost?.invokeTimeoutMs;
  const crawlTimeoutMs = options.patternflyOptions?.api?.crawlTimeoutMs;

  const invokePromise = handle.request<Extract<IpcResponse, { t: 'invoke:result' }>>(
    { t: 'invoke', toolId: 'crawl', args: request },
    'invoke:result',
    invokeTimeoutMs
  );

  const result = await timeoutFunction(invokePromise, {
    timeout: crawlTimeoutMs,
    errorMessage: `PatternFly API spider exceeded ${crawlTimeoutMs}ms. Shutting down.`
  });

  if (result.t !== 'invoke:result' || !('ok' in result)) {
    return { content: [], warnings: [], errors: ['Invalid invoke result'] };
  }

  return {
    content: (result.ok ? (result.result as any)?.content : []) ?? [],
    warnings: [],
    errors: !result.ok ? [result.error.message] : []
  };
};

/**
 * Shutdown the PatternFly API Host
 *
 * @param param0
 * @param param0.pluginHost
 * @param param1
 * @param param1.sessionId
 */
const sendApiHostShutdown = async (
  { pluginHost }: GlobalOptions = getOptions(),
  { sessionId }: AppSession = getSessionOptions()
): Promise<void> => {
  const handle = activeChildrenBySession.get(sessionId) as HostHandle | undefined;

  await shutdownChildProcess(handle, {
    gracePeriodMs: Math.max(0, Number(pluginHost?.gracePeriodMs) || 0),
    sessionId,
    label: 'PatternFly API Host'
  });
};

/**
 * Neutral adapter: CrawlResult -> SourceRecord[]
 *
 * @param result
 */
const toSourceRecords = (result: CrawlResult): SourceRecord[] => {
  const fetchedAt = new Date().toISOString();

  return (result.content || [])
    .filter(entry => !isEmptyPayload({ props: entry.props, css: entry.css, content: entry.content }))
    .map(entry => {
      const provenance: { url?: string, fetchedAt: string } = { fetchedAt };

      if (entry.url) {
        provenance.url = entry.url;
      }

      const record: SourceRecord = {
        sourceId: 'patternfly-api',
        kind: 'component',
        key: String(entry.key || '').toLowerCase(),
        payload: {
          props: entry.props,
          css: entry.css,
          content: entry.content
        },
        provenance: provenance
      };

      if (entry.version) {
        record.version = entry.version;
      }

      return record;
    });
};

/**
 * Data source for interacting with the PatternFly API.
 *
 * This source collects component-related data from the PatternFly API based on provided options.
 * It includes mechanisms to spawn an API host, crawl for component information, and gracefully handle
 * shutdown operations, while capturing any errors or warnings during the process.
 *
 * Properties:
 * - `id` - A unique identifier for this data source.
 * - `isEnabled` - A function that determines whether the source should be enabled based on the given global options.
 * - `collect` - An asynchronous function that collects records by communicating with the API,
 *   processes the results, and returns them along with any warnings or errors encountered.
 *
 * The `collect` method manages the lifecycle of the API host:
 * - Spawning the API host to crawl for required data.
 * - Defining crawl parameters, such as component paths and API versions, using the provided options.
 * - Performing the crawl and transforming the raw result into records.
 * - Handling errors and warnings encountered during the process.
 * - Ensuring that the API host is properly shut down after processing, even in case of failures.
 */
const spawnPatternFlyApiSource: RecordsSource<GlobalOptions, AppSession> = {
  id: 'patternfly-api',
  isEnabled: options => Boolean(options?.patternflyOptions?.api?.enabled),
  collect: async (options, _ctx) => {
    let handle: HostHandle | undefined;

    try {
      handle = await spawnPatternFlyHost(options);

      const crawlRequest: CrawlRequest = {
        componentPaths: options.patternflyOptions?.api?.componentPaths
      };

      if (options.patternflyOptions?.api?.versions) {
        crawlRequest.versions = [options.patternflyOptions.api.versions];
      }

      const result = await runPatternFlyApiCrawl(handle, crawlRequest, options);

      return {
        records: toSourceRecords(result),
        warnings: result.warnings,
        errors: result.errors
      };
    } catch (error) {
      return {
        records: [],
        warnings: [],
        errors: [`patternFlyApiSource.collect failed: ${formatUnknownError(error)}`]
      };
    } finally {
      if (handle) {
        await sendApiHostShutdown(options).catch(err =>
          log.warn(`shutdown after collect failed: ${formatUnknownError(err)}`));
      }
    }
  }
};

export {
  logWarningsErrors,
  spawnPatternFlyApiSource,
  toSourceRecords,
  sendApiHostShutdown,
  runPatternFlyApiCrawl,
  spawnPatternFlyHost,
  type CrawlResult,
  type CrawlRequest,
  type HostHandle
};
