import { type ChildProcess } from 'node:child_process';
import type { AppSession, GlobalOptions } from './options';
import { log, formatUnknownError } from './logger';
import { getOptions, getSessionOptions } from './options.context';
import { type IpcResponse } from './records.patternFlyIpc';
import {
  spawnChildProcess,
  shutdownChildProcess,
  activeChildrenBySession,
  type ChildHandle
} from './server.process';
import { isEmptyPayload } from './records.patternFlyApi';
import { type SourceRecord, type RecordsSource } from './records.types';

/**
 * Handle for a spawned Host process.
 *
 * @property manifest - Array of descriptors. Manifest returned by the child; today: single 'crawl' invokable.
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
 * Spawn the PatternFly API Host (child process), HELLO/LOAD/MANIFEST handshake,
 * and return a host handle. Mirrors server.tools.ts::spawnToolsHost.
 *
 * @param options
 */
const spawnApiHost = async (
  options: GlobalOptions = getOptions()
): Promise<HostHandle> => {
  const { pluginIsolation, pluginHost, nodeVersion } = options || {};
  const { loadTimeoutMs } = pluginHost || {};

  const handle = spawnChildProcess({
    importSpecifier: '#patternFlyHost',
    label: 'PatternFly API Host',
    isolation: {
      mode: pluginIsolation === 'strict' ? 'strict' : 'none',
      nodeVersion,
      fsReadAllowlist: [] // crawler is network-only
    }
  });

  // hello
  await handle.request({ t: 'hello' }, 'hello:ack', loadTimeoutMs);

  // load — child dynamically imports records.patternFlyApi
  const loadAck = await handle.request<Extract<IpcResponse, { t: 'load:ack' }>>(
    { t: 'load', specs: [], invokeTimeoutMs: loadTimeoutMs },
    'load:ack',
    loadTimeoutMs
  );

  if (loadAck.warnings?.length) {
    log.warn(`PatternFly API Host load warnings: ${loadAck.warnings.join('; ')}`);
  }
  if (loadAck.errors?.length) {
    log.error(`PatternFly API Host load errors: ${loadAck.errors.join('; ')}`);
  }

  // manifest
  const manifest = await handle.request<Extract<IpcResponse, { t: 'manifest:result' }>>(
    { t: 'manifest:get' },
    'manifest:result',
    loadTimeoutMs
  );

  return { ...handle, manifest: manifest.tools ?? [] };
};

/**
 * Send INVOKE(crawl) to the host, bounded by patternflyOptions.api.crawlTimeoutMs.
 *
 * @param handle
 * @param request
 * @param options
 */
const runCrawl = async (
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

  const wallClocked = crawlTimeoutMs && crawlTimeoutMs > 0
    ? Promise.race([
      invokePromise,
      new Promise<never>((_r, rej) =>
        setTimeout(() => rej(new Error(`crawl exceeded ${crawlTimeoutMs}ms wall clock`)), crawlTimeoutMs))
    ])
    : invokePromise;

  const result = await wallClocked;

  if (result.t !== 'invoke:result' || !('ok' in result)) {
    return { content: [], warnings: [], errors: ['Invalid invoke result'] };
  }

  return {
    content: (result.ok ? (result.result as any)?.content : []) ?? [],
    warnings: [],
    errors: !result.ok ? [result.error.message] : []
  };
};

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

const toSourceRecords = (result: CrawlResult): SourceRecord[] => {
  const fetchedAt = new Date().toISOString();

  return (result.content || [])
    .filter(entry => !isEmptyPayload({ props: entry.props, css: entry.css, content: entry.content }))
    .map(entry => {
      const provenance: { url?: string, fetchedAt: string } = { fetchedAt };

      if (entry.url) { provenance.url = entry.url; }

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

const patternFlyApiSource: RecordsSource<GlobalOptions, AppSession> = {
  id: 'patternfly-api',
  isEnabled: options => Boolean(options?.patternflyOptions?.api?.enabled),
  collect: async (options, _ctx) => {
    let handle: HostHandle | undefined;

    try {
      handle = await spawnApiHost(options);

      const crawlRequest: CrawlRequest = {
        componentPaths: options.patternflyOptions?.api?.componentPaths
      };

      if (options.patternflyOptions?.api?.versions) {
        crawlRequest.versions = [options.patternflyOptions.api.versions];
      }

      const result = await runCrawl(handle, crawlRequest, options);

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

// This should be what blends data together. Similar to server.tools.ts composeTools.
// const composePatternfly () => {};


export {
  patternFlyApiSource,
  toSourceRecords,
  sendApiHostShutdown,
  runCrawl,
  spawnApiHost,
  type CrawlResult,
  type CrawlRequest,
  type HostHandle
};
