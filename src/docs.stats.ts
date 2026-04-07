import { getStatsOptions } from './options.context';
import { publish } from './stats';
import { type StatsSession, DEFAULT_OPTIONS } from './options.defaults';
import { memo } from './server.caching';

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
 * @param statsOptions - Session-specific stats options.
 * @returns {NodeJS.Timeout} Timer handle for the recurring health report.
 */
const healthReport = (statsOptions: StatsSession) => {
  publish('health', {
    memory: process.memoryUsage(),
    uptime: process.uptime()
  }, statsOptions);

  return setTimeout(() => {
    healthReport(statsOptions);
  }, statsOptions?.reportIntervalMs.health).unref();
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
  // Start the health report
  const healthTimer = healthReport(statsOptions);
  let resolveStatsPromise: (value: DocsStats) => void;

  const statsPromise: Promise<DocsStats> = new Promise(resolve => {
    resolveStatsPromise = resolve;
  });

  // Immediately resolve with current report
  resolveStatsPromise!(statsReport(statsOptions));

  return {

    /**
     * Returns the docs stats and channel IDs.
     *
     * @returns {Promise<DocsStats>} - Docs stats and channel IDs.
     */
    getStats: (): Promise<DocsStats> => statsPromise,

    /**
     * Cleans up timers and resources.
     */
    unsubscribe: () => {
      clearTimeout(healthTimer);
    }
  };
};

/**
 * Memoize the docs stats.
 */
createDocsStats.memo = memo(createDocsStats, DEFAULT_OPTIONS.resourceMemoOptions.default);

export { createDocsStats, healthReport, statsReport, type DocsStats as Stats };
