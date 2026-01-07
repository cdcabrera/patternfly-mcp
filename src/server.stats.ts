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
 */
const createServerStats = (httpHandle?: HttpServerHandle | null, statsOptions = getStatsOptions(), options = getOptions()) => {
  const { channels } = statsOptions;
  const httpPort = (options.isHttp && httpHandle?.port) || undefined;
  const transportTimer = transportReport({ httpPort }, statsOptions);
  const healthTimer = healthReport(statsOptions);

  return {

    /**
     * Returns the server stats and channel IDs.
     *
     * @returns {ServerStats} - Server stats and channel IDs.
     */
    getStats: (): ServerStats => (
      {
        timestamp: new Date().toISOString(),
        reports: {
          transport: {
            type: 'transport',
            timestamp: new Date().toISOString(),
            method: options.isHttp ? 'http' : 'stdio',
            ...(httpHandle?.port ? { port: httpHandle.port } : {}),
            channelId: channels.transport
          },
          health: { channelId: channels.health },
          traffic: { channelId: channels.traffic }
        }
      }
    ),

    /**
     * Records an event-driven traffic metric (e.g., tool/resource execution).
     */
    traffic: () => {
      const { start, report: trafficReport } = report('traffic');

      start();

      return trafficReport;
    },

    /*
    reportTraffic: (data: { start: number }) => {
      const updatedData = { ...data, duration: data.start - Date.now() };

      publish('traffic', updatedData);
    },
    */

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

export { createServerStats, report };
