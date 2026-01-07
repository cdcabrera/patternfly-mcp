import { channel } from 'node:diagnostics_channel';
import { getStatsOptions } from './options.context';
import { type StatsSession } from './options.defaults';

/**
 * Valid report types for server statistics.
 */
type StatReportType = 'transport' | 'health' | 'traffic' | 'session';

/**
 * Base interface for all telemetry reports.
 */
interface StatReport {
  type: StatReportType;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Publishes a structured report to a faceted diagnostics channel if there is an active subscriber.
 *
 * @param type - The facet/type of the report (e.g., 'health').
 * @param data - Telemetry payload.
 * @param {StatsSession} [options] - Session options.
 */
const publish = (type: StatReportType, data: Record<string, unknown>, options: StatsSession = getStatsOptions()) => {
  const channelName = options.channels[type];
  const setChannel = channel(channelName);

  if (setChannel.hasSubscribers) {
    setChannel.publish({
      type,
      timestamp: new Date().toISOString(),
      ...data
    });
  }
};

export {
  publish,
  type StatReport,
  type StatReportType
};
