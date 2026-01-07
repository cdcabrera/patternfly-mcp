import {
  getOptions,
  getStatsOptions
} from './options.context';
import { type HttpServerHandle } from './server.http';
import { publish, type StatReportType } from './stats';
import { type ServerStats } from './server';
import { memo } from './server.caching';
import { DEFAULT_OPTIONS, type StatsSession } from './options.defaults';

/**
 * Reports server health metrics (e.g., memory usage and uptime).
 *
 * @param statsOptions - Session-specific stats options.
 * @returns {NodeJS.Timeout} - Timer for the next health report.
 */
const healthReport = (statsOptions: StatsSession) => {
  publish('health', {
    memory: process.memoryUsage(),
    uptime: process.uptime()
  });

  return setTimeout(() => {
    healthReport(statsOptions);
  }, statsOptions?.reportIntervalMs.health).unref();
};

/**
 * Creates a server stats report object.
 *
 * @param params - Report parameters.
 * @param params.httpPort - HTTP server port if available.
 * @param statsOptions - Session-specific stats options.
 * @returns {ServerStats} - Server stats and channel IDs.
 */
const statsReport = ({ httpPort }: { httpPort?: number | undefined } = {}, statsOptions: StatsSession): ServerStats => (
  {
    timestamp: new Date().toISOString(),
    reports: {
      transport: {
        type: 'transport',
        timestamp: new Date().toISOString(),
        method: httpPort ? 'http' : 'stdio',
        ...(httpPort ? { port: httpPort } : {}),
        channelId: statsOptions.channels.transport
      },
      health: { channelId: statsOptions.channels.health },
      traffic: { channelId: statsOptions.channels.traffic }
    }
  }
);

/**
 * Reports server transport metrics (e.g., HTTP server port).
 *
 * @param params - Report parameters.
 * @param params.httpPort - HTTP server port if available.
 * @param statsOptions - Session-specific stats options.
 * @returns {NodeJS.Timeout} - Timer for the next transport report.
 */
const transportReport = ({ httpPort }: { httpPort?: number | undefined } = {}, statsOptions: StatsSession) => {
  publish('transport', {
    method: httpPort ? 'http' : 'stdio',
    port: httpPort
  });

  return setTimeout(() => {
    transportReport({ httpPort }, statsOptions);
  }, statsOptions?.reportIntervalMs.transport).unref();
};

/**
 * Creates a traffic report object that tracks the duration of a traffic event.
 *
 * @param type
 */
const report = (type: StatReportType) => {
  let start: number = 0;

  return {
    start: () => start = Date.now(),
    report: (data: Record<string, unknown>) => {
      const duration = start - Date.now();
      const updatedData = { ...data, duration: duration > 0 ? duration : 0 };

      publish(type, updatedData);
    }
  };
};

/**
 * Creates a telemetry tracker for a server instance.
 *
 * @param {HttpServerHandle} [httpHandle] - Handle for the HTTP server (if applicable).
 * @param options - Global server options.
 * @param [statsOptions] - Session-specific stats options.
 * @returns - An object with methods to manage server telemetry:
 *  - `getStats`: Returns the server stats and channel IDs.
 *  - `traffic`: Records an event-driven traffic metric (e.g., tool/resource execution).
 *  - `unsubscribe`: Cleans up timers and resources.
 */
const createServerStats = (httpHandle?: HttpServerHandle | null, statsOptions = getStatsOptions(), options = getOptions()) => {
  const httpPort = (options.isHttp && httpHandle?.port) || undefined;
  const healthTimer = healthReport(statsOptions);
  const transportTimer = transportReport({ httpPort }, statsOptions);

  return {

    /**
     * Returns the server stats and channel IDs.
     *
     * @returns {ServerStats} - Server stats and channel IDs.
     */
    getStats: (): ServerStats => statsReport({ httpPort }, statsOptions),

    /**
     * Records an event-driven traffic metric (e.g., tool/resource execution).
     * - Automatically starts a timer to report traffic duration on the initial function call.
     *
     * @returns {() => void} - Function to stop the traffic report.
     */
    traffic: () => {
      const { start, report: trafficReport } = report('traffic');

      start();

      return trafficReport;
    },

    /**
     * Cleans up timers and resources.
     */
    unsubscribe: () => {
      clearTimeout(transportTimer);
      clearTimeout(healthTimer);
    }
  };
};

/**
 * Memoized version of `createServerStats`.
 */
createServerStats.memo = memo(createServerStats, DEFAULT_OPTIONS.resourceMemoOptions.default);

export { createServerStats, healthReport, report, statsReport, transportReport };
