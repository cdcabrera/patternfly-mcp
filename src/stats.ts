import { channel } from 'node:diagnostics_channel';
import type {LoggingSession} from "./options.defaults";
import {getLoggerOptions} from "./options.context";
import {
  formatUnknownError,
  registerStderrSubscriber,
  Unsubscribe
} from "./logger";

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
 * Generates the full channel name for a specific stat type and session.
 *
 * @param type
 * @param sessionHash
 */
const getStatChannelId = (type: StatReportType, sessionHash: string) =>
  `pf-mcp:stats:${type}:${sessionHash}`;

/**
 * Publishes a report to a faceted diagnostics channel only if there is an active subscriber.
 *
 * @param type - The facet/type of the report (e.g., 'health').
 * @param sessionHash - The hashed public session ID for isolation.
 * @param data - The telemetry payload.
 */
const publishStat = (type: StatReportType, sessionHash: string, data: Record<string, unknown>) => {
  const setChannel = channel(getStatChannelId(type, sessionHash));

  if (setChannel.hasSubscribers) {
    setChannel.publish({
      type,
      timestamp: new Date().toISOString(),
      ...data
    });
  }

  return
};



/**
 * Publish a structured log event to the diagnostics channel.
 *
 * @param level - Log level for the event
 * @param {LoggingSession} [options]
 * @param [msg] - Optional log message (string) or first argument
 * @param [args] - Optional additional arguments for the log event
 */
const publish = (level: LogLevel, options: LoggingSession = getLoggerOptions(), msg?: unknown, ...args: unknown[]) => {
  const channelName = options?.channelName;
  const timestamp = Date.now();
  const event: LogEvent = { level, time: timestamp };

  // If first arg is a string, treat it as the message and capture rest as args
  if (typeof msg === 'string') {
    event.msg = msg;

    if (args.length) {
      event.args = args;
    }
  } else {
    const arr = [msg, ...args].filter(value => value !== undefined);

    if (arr.length) {
      event.args = arr as unknown[];
    }
  }

  event.transport = options?.transport;

  if (channelName) {
    channel(channelName).publish(event);
  }
};

const createStats = (options: LoggingSession = getLoggerOptions()): Unsubscribe => {
  const unsubscribeLoggerFuncs: Unsubscribe[] = [];

  if (options?.channelName && options?.stderr) {
    unsubscribeLoggerFuncs.push(registerStderrSubscriber(options));
  }

  return () => {
    unsubscribeLoggerFuncs.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        process.stderr.write(`Error unsubscribing from diagnostics channel: ${formatUnknownError(error)}\n`);
      }
    });

    unsubscribeLoggerFuncs.length = 0;
  };
};

export {
  getStatChannelId,
  publishStat
};
