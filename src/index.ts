import { parseCliOptions, type CliOptions, type DefaultOptionsOverrides } from './options';
import { getSessionOptions, setOptions, runWithSession } from './options.context';
import {
  runServer,
  type ServerInstance,
  type ServerSettings,
  type ServerOnLog,
  type ServerOnLogHandler,
  type ServerLogEvent,
  type McpToolCreator
} from './server';
import { createMcpTool, type ToolConfig, type MultiToolConfig } from './server.toolsCreator';

/**
 * Options for "programmatic" use. Extends the `DefaultOptions` interface.
 *
 * @interface
 *
 * @property {('cli' | 'programmatic' | 'test')} [mode] - Optional string property that specifies the mode of operation.
 *     Defaults to `'programmatic'`.
 *     - `'cli'`: Functionality is being executed in a cli context. Allows process exits.
 *     - `'programmatic'`: Functionality is invoked programmatically. Allows process exits.
 *     - `'test'`: Functionality is being tested. Does NOT allow process exits.
 */
type PfMcpOptions = DefaultOptionsOverrides & {
  mode?: 'cli' | 'programmatic' | 'test';
};

/**
 * Additional settings for programmatic control.
 *
 * @property {boolean} allowProcessExit - Override process exits. Useful for tests
 *     or programmatic use to avoid exiting.
 *     - Setting directly overrides `mode` property defaults.
 *     - When `mode=cli` or `mode=programmatic` or `undefined`, defaults to `true`.
 *     - When `mode=test`, defaults to `false`.
 */
type PfMcpSettings = Pick<ServerSettings, 'allowProcessExit'>;

/**
 * Server instance with shutdown capability
 *
 * @alias ServerInstance
 * @property stop - Stops the server, gracefully.
 * @property isRunning - Indicates whether the server is running.
 * @property onLog - Subscribes to server logs. Automatically unsubscribed on server shutdown.
 */
type PfMcpInstance = ServerInstance;

/**
 * Subscribes a handler function, `PfMcpOnLogHandler`, to server logs. Automatically unsubscribed on server shutdown.
 *
 * @alias ServerOnLog
 * @param {PfMcpOnLogHandler} handler - The function responsible for handling server log events.
 * @returns A cleanup function that unregisters the logging handler when called.
 */
type PfMcpOnLog = ServerOnLog;

/**
 * The handler function passed by `onLog`, `PfMcpOnLog`, to subscribe to server logs. Automatically unsubscribed on server shutdown.
 *
 * @alias ServerOnLogHandler
 * @param {PfMcpLogEvent} entry
 */
type PfMcpOnLogHandler = ServerOnLogHandler;

/**
 * The log event passed to the `onLog` handler, `PfMcpOnLogHandler`.
 *
 * @alias ServerLogEvent
 * @property level - Severity level of the event.
 * @property msg - Optional Message providing context or description of the event.
 * @property args - Optional additional arguments associated with the event.
 * @property fields - Optional key-value pairs for metadata associated with the event.
 * @property time - Event timestamp in epoch milliseconds.
 * @property source - Name of the module or subsystem generating the event, if available.
 * @property transport - Transport configuration used for this event.
 */
type PfMcpLogEvent = ServerLogEvent;

/**
 * An MCP tool "wrapper", or "creator", from `createMcpTool`.
 *
 * Passed back to `toolModules` in `PfMcpOptions` to register a tool.
 *
 * @alias McpToolCreator
 */
type PfMcpToolCreator = McpToolCreator;

/**
 * Main function - CLI entry point with optional programmatic overrides
 *
 * @param [pfMcpOptions] - User configurable options
 * @param [pfMcpSettings] - MCP server settings
 *
 * @returns {Promise<PfMcpInstance>} Server-instance with shutdown capability
 *
 * @throws {Error} If the server fails to start or any error occurs during initialization,
 *     and `allowProcessExit` is set to `false`, the error will be thrown rather than exiting
 *     the process.
 */
const main = async (
  pfMcpOptions: PfMcpOptions = {},
  pfMcpSettings: PfMcpSettings = {}
): Promise<PfMcpInstance> => {
  const { mode, ...options } = pfMcpOptions;
  const { allowProcessExit } = pfMcpSettings;

  const modes = ['cli', 'programmatic', 'test'];
  const updatedMode = mode && modes.includes(mode) ? mode : 'programmatic';
  const updatedAllowProcessExit = allowProcessExit ?? updatedMode !== 'test';

  try {
    const cliOptions = parseCliOptions();
    const mergedOptions = setOptions({ ...cliOptions, ...options });
    const session = getSessionOptions();

    // use runWithSession to enable session in listeners
    return await runWithSession(session, async () =>
      // `runServer` doesn't require options in the memo key, but we pass fully-merged options for stable hashing
      await runServer.memo(mergedOptions, {
        allowProcessExit: updatedAllowProcessExit
      }));
  } catch (error) {
    console.error('Failed to start server:', error);

    if (updatedAllowProcessExit) {
      process.exit(1);
    } else {
      throw error;
    }
  }
};

export {
  createMcpTool,
  main,
  main as start,
  type CliOptions,
  type PfMcpOptions,
  type PfMcpSettings,
  type PfMcpInstance,
  type PfMcpLogEvent,
  type PfMcpOnLog,
  type PfMcpOnLogHandler,
  type PfMcpToolCreator,
  type ToolConfig,
  type MultiToolConfig
};
