import { log, type LogEvent } from './logger';
import { getOptions, getSessionOptions } from './options.context';
import { type GlobalOptions } from './options';
import { createDocsLogger } from './docs.logger';
import { createDocsStats, type Stats } from './docs.stats';
import { stat, type StatReport } from './stats';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS } from './options.defaults';
// import { sendDocsHostShutdown } from './patternFly.docs';
import { sendDocsHostShutdown } from './docs.spider';
import { runSpider, type DocsSpider } from './docs.getResources';

/**
 * Docs options. Equivalent to GlobalOptions.
 */
type DocsOptions = GlobalOptions;

/**
 * Settings for docs build.
 *
 * @interface DocsSettings
 *
 * @property [enableSigint] - Indicates whether SIGINT signal handling is enabled.
 * @property [allowProcessExit] - Determines if the process is allowed to exit explicitly.
 */
interface DocsSettings {
  enableSigint?: boolean;
  allowProcessExit?: boolean;
}

/**
 * Statistics for the docs build.
 */
type DocsStats = Stats;
// interface DocsStats {
//   generated: string;
//  totalEntries: number;
//  lastBuildRun: number;
//

type DocsStatReport = StatReport;

/**
 * A callback to Promise return docs stats.
 */
type DocsGetStats = () => Promise<DocsStats>;

/**
 * Docs log event.
 */
type DocsLogEvent = LogEvent;

/**
 * A handler function to subscribe to doc build logs. Automatically unsubscribed on shutdown.
 *
 * @param entry
 */
type DocsOnLogHandler = (entry: DocsLogEvent) => void;

/**
 * Subscribe a handler function to doc build logs. Automatically unsubscribed on shutdown.
 *
 * @param {DocsOnLogHandler} handler - The function responsible for handling log events.
 * @returns A cleanup function that unregisters the logging handler when called.
 */
type DocsOnLog = (handler: DocsOnLogHandler) => () => void;

/**
 * Docs instance with shutdown capability
 *
 * @property stop - Stops the doc build, gracefully.
 * @property isRunning - Indicates whether the doc build is running.
 * @property {DocsGetStats} getStats - Resolves doc build stats.
 * @property {DocsOnLog} onLog - Subscribes to doc build logs. Automatically unsubscribed on shutdown.
 */
interface DocsInstance {
  stop(): Promise<void>;
  isRunning(): boolean;
  getStats: DocsGetStats;
  onLog: DocsOnLog;
}

/**
 * Create and run the PatternFly docs builder and return a handle.
 *
 * @param [options] Docs options
 * @param [settings] Docs settings (signal handling, etc.)
 * @param [settings.enableSigint] - Indicates whether SIGINT signal handling is enabled.
 * @param [settings.allowProcessExit] - Determines if the process is allowed to exit explicitly, useful for testing.
 * @returns Docs instance with `stop()`, `getStats()` `isRunning()`, and `onLog()` subscription.
 */
const runDocs = async (options: GlobalOptions = getOptions(), {
  enableSigint = true,
  allowProcessExit = true
}: DocsSettings = {}): Promise<DocsInstance> => {
  const session = getSessionOptions();

  let spider: DocsSpider | null = null;
  let unsubscribeDocsLogger: (() => void) | null = null;
  let unsubscribeDocsStats: (() => void) | null = null;
  let sigintHandler: (() => void) | null = null;
  let running = false;
  const abortController = new AbortController();
  let onLogSetup: DocsOnLog = () => () => {};
  let getStatsSetup: DocsGetStats = () => Promise.resolve({} as DocsStats);

  const stopDocs = async () => {
    log.debug(`${options.name} attempting shutdown.`);

    if (spider && running) {
      log.info(`${options.name} shutting down...`);

      if (sigintHandler) {
        process.off('SIGINT', sigintHandler);
        sigintHandler = null;
      }

      log.debug('...closing docs build');
      await spider?.close();
      running = false;

      await sendDocsHostShutdown();

      log.info(`${options.name} closed!\n`);
      unsubscribeDocsLogger?.();
      unsubscribeDocsStats?.();

      if (allowProcessExit) {
        process.exit(0);
      }
    }
  };

  try {
    // Setup docs logging.
    const loggerSubUnsub = createDocsLogger.memo();

    log.info(`Docs logging enabled.`);

    if (options?.logging?.stderr === undefined) {
      log.debug(
        `${options.name} docs logging enabled with partial flags`,
        `isStderr = ${options?.logging?.stderr !== undefined}`
      );
    }

    const statsTracker = createDocsStats();

    log.info(`Docs stats enabled.`);

    if (loggerSubUnsub) {
      const { subscribe, unsubscribe } = loggerSubUnsub;

      // Track active logging subscriptions to clean up on stop()
      unsubscribeDocsLogger = unsubscribe;

      // Setup server logging for external handlers
      onLogSetup = (handler: DocsOnLogHandler) => subscribe(handler);
    }

    if (statsTracker) {
      // Track active stat subscriptions to clean up on stop()
      unsubscribeDocsStats = statsTracker.unsubscribe;

      // Setup stats for external handlers
      getStatsSetup = () => statsTracker.getStats();
    }

    if (enableSigint && !sigintHandler) {
      sigintHandler = () => {
        void stopDocs();
      };
      process.on('SIGINT', sigintHandler);
    }

    running = true;

    log.info(`${options.name} PatternFly docs build running`);

    const version = 'v6';
    const baseUrl = options.patternflyOptions.api.endpoints[version];

    spider = {
      close: async () => {
        abortController.abort();
      }
    };

    void runSpider(baseUrl, version, {
      running: () => running,
      abortController
    });
  } catch (error) {
    log.error(`Error creating ${options.name} server:`, error);
    throw error;
  }

  return {
    async stop(): Promise<void> {
      return await stopDocs();
    },

    isRunning(): boolean {
      return running;
    },

    async getStats(): Promise<DocsStats> {
      return await getStatsSetup();
    },

    onLog(handler: DocsOnLogHandler): () => void {
      // Simple one-off log event to notify the handler of the docs startup.
      handler({ level: 'info', msg: `${options.name} running!`, transport: options.logging?.transport } as LogEvent);

      return onLogSetup(handler);
    }
  };
};

/**
 * Memoized version of runDocs.
 * - Automatically cleans up docs build when restarted
 * - `onCacheRollout` closes builds that were rolled out of caching due to cache limit
 */
runDocs.memo = memo(
  runDocs,
  {
    debug: info => {
      log.debug(`Docs memo: ${JSON.stringify(info, null, 2)}`);
    },
    onCacheRollout: async ({ removed }) => {
      const results: PromiseSettledResult<DocsInstance>[] = await Promise.allSettled(removed);

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const docs = result.value;

          if (docs?.isRunning?.()) {
            try {
              await docs.stop();
            } catch (error) {
              // Avoid engaging the contextual log channel on rollout.
              console.error(`Error stopping docs: ${error}`);
            }
          }
        } else {
          // Avoid engaging the contextual log channel on rollout.
          console.error(`Error cleaning up docs: ${result?.reason?.message || result?.reason || 'Unknown error'}`);
        }
      }
    }
  }
);

export {
  runDocs,
  type DocsInstance,
  type DocsLogEvent,
  type DocsOnLog,
  type DocsOnLogHandler,
  type DocsOptions,
  type DocsSettings,
  type DocsStatReport,
  type DocsStats,
  type DocsGetStats
};
