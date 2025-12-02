import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type LoggingLevel } from '@modelcontextprotocol/sdk/types.js';
import { getOptions } from './options.context';
import { type GlobalOptions } from './options';
import { DEFAULT_OPTIONS } from './options.defaults';
import { createLogger, log, logSeverity, subscribeToChannel, type LogEvent, type LogLevel, type Unsubscribe } from './logger';
import { memo } from './server.caching';

type McpLoggingLevel = LoggingLevel;

/**
 * Convert a log level to an MCP-compatible level.
 *
 * @param {LogLevel} level - Log level to convert
 * @returns MCP-compatible logging level
 */
const toMcpLevel = (level: LogLevel): McpLoggingLevel => {
  switch (level) {
    case 'debug':
      return 'debug';
    case 'info':
      return 'info';
    case 'warn':
      return 'warning';
    case 'error':
    default:
      return 'error';
  }
};

/**
 * Register a handler that forwards log events to connected MCP clients.
 *
 * - This requires the server to advertise `capabilities.logging`.
 * - Event is fire-and-forget, swallow errors to avoid affecting app flow
 *
 * @param {McpServer} server - MCP server instance
 * @param {GlobalOptions} options
 * @returns Unsubscribe function to remove the subscriber.
 */
const registerMcpSubscriber = (server: McpServer, { logging, name }: GlobalOptions) =>
  subscribeToChannel((event: LogEvent) => {
    if (logSeverity(event.level) < logSeverity(logging?.level)) {
      return;
    }

    const updatedMsg = event.msg && event?.args?.length ? { message: event.msg, args: event.args } : undefined;
    const data = updatedMsg || event.msg || event.args || {};

    try {
      void server
        .sendLoggingMessage({ level: toMcpLevel(event.level), logger: name, data })
        .catch(() => {});
    } catch {}
  });

/**
 * Create a logger for the server instance.
 *
 * @param {McpServer} server
 * @param {GlobalOptions} options
 * @returns An object with methods to manage logging subscriptions:
 *   - `subscribe`: Registers a new log event handler if a valid handler function is provided.
 *   - `unsubscribe`: Unsubscribes and cleans up all available registered loggers and handlers.
 */
const createServerLogger = (server: McpServer, options: GlobalOptions = getOptions()) => {
  // Track active subscribers to unsubscribe on server shutdown
  const unsubscribeLoggerFuncs: Unsubscribe[] = [];

  if (options?.logging?.channelName) {
    // Register the diagnostics channel
    unsubscribeLoggerFuncs.push(createLogger(options.logging));

    if (options.logging.protocol) {
      // Register the MCP subscriber
      unsubscribeLoggerFuncs.push(registerMcpSubscriber(server, options));
    }
  }

  return {
    subscribe: (handler?: (event: LogEvent) => void) => {
      if (typeof handler !== 'function') {
        return () => {};
      }

      const unsubscribe = subscribeToChannel(handler);
      let activeSubscribe = true;

      // Wrap the unsubscribe function so it removes itself from the list of active subscribers
      const wrappedUnsubscribe = () => {
        if (!activeSubscribe) {
          return;
        }
        activeSubscribe = false;
        unsubscribe();

        const index = unsubscribeLoggerFuncs.indexOf(wrappedUnsubscribe);

        if (index > -1) {
          unsubscribeLoggerFuncs.splice(index, 1);
        }
      };

      // Track for server-wide cleanup
      unsubscribeLoggerFuncs.push(wrappedUnsubscribe);

      return wrappedUnsubscribe;
    },
    unsubscribe: () => {
      unsubscribeLoggerFuncs.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (error) {
          log.debug('Error unsubscribing from diagnostics channel', error);
        }
      });
      // Clear the list of active subscribers
      unsubscribeLoggerFuncs.length = 0;
    }
  };
};

/**
 * Memoize the server logger.
 */
createServerLogger.memo = memo(createServerLogger, DEFAULT_OPTIONS.resourceMemoOptions.default);

export { createServerLogger, registerMcpSubscriber, toMcpLevel, type McpLoggingLevel };
