import {
  getOptions,
  getStatsOptions
} from './options.context';
import { type HttpServerHandle } from './server.http';
import { publish, type StatReportType, type StatReport } from './stats';
import { type StatsSession } from './options.defaults';

/**
 * Transport-specific telemetry report.
 *
 * @interface TransportReport
 */
interface TransportReport extends StatReport {
  type: 'transport';
  method: 'stdio' | 'http';
  port?: number;
}

/**
 * Server stats.
 *
 * @interface Stats
 * @property {string} timestamp - Timestamp of the server stats.
 * @property reports - Object containing various server telemetry reports.
 * @property {TransportReport} reports.transport - Transport-specific telemetry report.
 * @property reports.health - Server health metrics (e.g., memory usage and uptime).
 * @property reports.traffic - Event-driven traffic metric (e.g., tool/resource execution).
 */
interface Stats {
  timestamp: string;
  reports: {
    transport: TransportReport & { channelId: string };
    health: { channelId: string };
    traffic: { channelId: string };
  };
}

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
 * @returns {Stats} - Server stats and channel IDs.
 */
const statsReport = ({ httpPort }: { httpPort?: number | undefined } = {}, statsOptions: StatsSession): Stats => ({
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
});

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
      const duration = Date.now() - start;
      const updatedData = { ...data, duration: duration > 0 ? duration : 0 };

      publish(type, updatedData);
    }
  };
};

/**
 * Creates a telemetry tracker for a server instance.
 *
 * - Starts the health report timer.
 *
 * @param {StatsSession} [statsOptions] - Session-specific stats options.
 * @param {GlobalOptions} [options] - Global server options.
 * @returns - An object with methods to manage server telemetry:
 *  - `getStats`: Resolve server stats and channel IDs.
 *  - `setStats`: Uses the HTTP server handle and starts the transport report timer.
 *  - `traffic`: Records an event-driven traffic metric (e.g., tool/resource execution).
 *  - `unsubscribe`: Cleans up timers and resources.
 */
const createServerStats = (statsOptions = getStatsOptions(), options = getOptions()) => {
  // Start the health report
  const healthTimer = healthReport(statsOptions);
  let transportTimer: NodeJS.Timeout;
  let resolveStatsPromise: (value: Stats) => void;

  const statsPromise: Promise<Stats> = new Promise(resolve => {
    resolveStatsPromise = resolve;
  });

  return {

    /**
     * Returns the server stats and channel IDs.
     *
     * @returns {Promise<Stats>} - Server stats and channel IDs.
     */
    getStats: (): Promise<Stats> => statsPromise,

    /**
     * Uses the HTTP server handle and starts the transport report timer.
     *
     * @param {HttpServerHandle} [httpHandle] - Handle for the HTTP server if available.
     */
    setStats: (httpHandle?: HttpServerHandle | null) => {
      const httpPort = options.isHttp ? httpHandle?.port : undefined;
      const stats = statsReport({ httpPort }, statsOptions);

      transportTimer = transportReport({ httpPort }, statsOptions);

      resolveStatsPromise(stats);
    },

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

export { createServerStats, healthReport, report, statsReport, transportReport, type Stats };
