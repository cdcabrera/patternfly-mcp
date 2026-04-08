import { getStatsOptions } from './options.context';
import { publish } from './stats';
import { type StatsSession } from './options.defaults';
import { deferTask, type DeferTaskHandle } from './server.task';

/**
 * Documentation build stats.
 *
 * @interface DocsStats
 * @property {string} timestamp - Timestamp of the docs stats.
 * @property reports - Object containing various docs telemetry reports.
 * @property reports.health - Docs health metrics (e.g., memory usage and uptime).
 */
interface DocsStats {
  timestamp: string;
  reports: {
    health: { channelId: string };
    traffic: { channelId: string };
  };
}

/**
 * Reports docs health metrics.
 *
 * @param params - Report parameters.
 * @param params.isRunning - Are stats running?
 * @param statsOptions - Session-specific stats options.
 * @returns {NodeJS.Timeout} Timer handle for the recurring health report.
 */
const healthReport = ({ isRunning }: { isRunning?: undefined | (() => boolean) } = {}, statsOptions: StatsSession) => {
  if (isRunning === undefined || !isRunning()) {
    return;
  }

  publish('health', {
    memory: process.memoryUsage(),
    uptime: process.uptime()
  }, statsOptions);
};

/**
 * Creates a docs stats report object.
 *
 * @param statsOptions - Session-specific stats options.
 * @returns {DocsStats} - Docs stats and channel IDs.
 */
const statsReport = (statsOptions: StatsSession): DocsStats => ({
  timestamp: new Date().toISOString(),
  reports: {
    health: { channelId: statsOptions.channels.health },
    traffic: { channelId: statsOptions.channels.traffic }
  }
});

/**
 * Creates a telemetry tracker for documentation tasks.
 *
 * @param {StatsSession} [statsOptions] - Session-specific stats options.
 * @returns - An object with methods to manage docs telemetry:
 *  - `getStats`: Resolve docs stats and channel IDs.
 *  - `unsubscribe`: Cleans up timers and resources.
 */
const createDocsStats = (statsOptions = getStatsOptions()) => {
  let healthTask: DeferTaskHandle<void>;

  let resolveStatsPromise: ((value: DocsStats) => void);

  const statsPromise: Promise<DocsStats> = new Promise(resolve => {
    resolveStatsPromise = resolve;
  });

  return {

    /**
     * Returns the docs stats and channel IDs.
     *
     * @returns {Promise<DocsStats>} - Docs stats and channel IDs.
     */
    getStats: (): Promise<DocsStats> => statsPromise,

    /**
     * Start the report timer.
     */
    startStats: () => {
      const stats = statsReport(statsOptions);

      // Start the health report. Defining repeat as undefined keeps the loop infinite.
      healthTask = deferTask(() => healthReport({ isRunning: healthTask.isRunning }, statsOptions), {
        timeoutMs: statsOptions.reportIntervalMs.health,
        repeat: undefined // Infinite
      });

      void healthTask.start();

      // Immediately resolve with current report
      resolveStatsPromise(stats);
    },

    /**
     * Cleans up timers and resources.
     */
    unsubscribe: async () => Promise.allSettled([healthTask?.stop()])
  };
};

export { createDocsStats, healthReport, statsReport, type DocsStats as Stats };
