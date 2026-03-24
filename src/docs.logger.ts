import { getLoggerOptions } from './options.context';
import { DEFAULT_OPTIONS, type LoggingSession } from './options.defaults';
import { createLogger, log, subscribeToChannel, type LogEvent, type Unsubscribe } from './logger';
import { memo } from './server.caching';

/**
 * Create a logger for documentation tasks.
 *
 * @param {LoggingSession} [loggingSession]
 * @returns An object with methods to manage logging subscriptions:
 *   - `subscribe`: Registers a new log event handler if a valid handler function is provided.
 *   - `unsubscribe`: Unsubscribes and cleans up all available registered loggers and handlers.
 */
const createDocsLogger = (loggingSession: LoggingSession = getLoggerOptions()) => {
  // Track active subscribers to unsubscribe on docs shutdown
  const unsubscribeLoggerFuncs: Unsubscribe[] = [];

  if (loggingSession?.channelName) {
    // Register the diagnostics channel
    unsubscribeLoggerFuncs.push(createLogger(loggingSession));
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

        try {
          unsubscribe();
        } finally {
          const index = unsubscribeLoggerFuncs.indexOf(wrappedUnsubscribe);

          if (index > -1) {
            unsubscribeLoggerFuncs.splice(index, 1);
          }
        }
      };

      // Track for docs-wide cleanup
      unsubscribeLoggerFuncs.push(wrappedUnsubscribe);

      return wrappedUnsubscribe;
    },
    unsubscribe: () => {
      unsubscribeLoggerFuncs.forEach(unsubscribe => {
        try {
          unsubscribe();
        } catch (error) {
          log.debug('Error unsubscribing from docs diagnostics channel', error);
        }
      });

      unsubscribeLoggerFuncs.length = 0;
    }
  };
};

/**
 * Memoize the docs logger.
 */
createDocsLogger.memo = memo(createDocsLogger, DEFAULT_OPTIONS.resourceMemoOptions.default);

export { createDocsLogger };
