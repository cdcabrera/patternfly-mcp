import { parseCliOptions, type CliOptions, type DefaultOptionsOverrides, type GlobalOptions } from './options';
import { getSessionOptions, setOptions, runWithSession } from './options.context';
import {
  runServer,
  type ServerInstance,
  type ServerSettings,
  type ServerOnLog,
  type ServerOnLogHandler,
  type ServerLogEvent,
  type ServerStatReport,
  type ServerStats,
  type ServerGetStats
} from './server';
import {
  runDocs,
  type DocsInstance,
  type DocsSettings,
  type DocsOnLog,
  type DocsOnLogHandler,
  type DocsLogEvent,
  type DocsStatReport,
  type DocsStats,
  type DocsGetStats
} from './docs';
import {
  createMcpTool,
  type ToolCreator,
  type ToolModule,
  type ToolConfig,
  type ToolMultiConfig,
  type ToolExternalOptions,
  type ToolInternalOptions
} from './server.toolsUser';

/**
 * Options for "programmatic" use. Extends the `DefaultOptions` interface.
 */
type PfMcpOptions = DefaultOptionsOverrides;

/**
 * Additional settings for programmatic control.
 *
 * @property {boolean} allowProcessExit - Override process exits. Useful for tests
 *     or programmatic use to avoid exiting.
 *     - Setting directly overrides `mode` property defaults.
 *     - When `mode=cli`, `mode=programmatic`, `mode=docs`, or `undefined`, defaults to `true`.
 *     - When `mode=test`, defaults to `false`.
 */
type PfMcpSettings = Pick<ServerSettings, 'allowProcessExit'> | Pick<DocsSettings, 'allowProcessExit'>;

/**
 * Interchangeable Server or Docs instance with shutdown capability.
 *
 * @alias ServerInstance
 * @alias DocsInstance
 */
type PfMcpInstance = ServerInstance | DocsInstance;

/**
 * Subscribes a handler function, `PfMcpOnLogHandler`, to logs. Automatically unsubscribed on shutdown.
 *
 * @alias ServerOnLog
 * @alias DocsOnLog
 */
type PfMcpOnLog = ServerOnLog | DocsOnLog;

/**
 * The handler function passed by `onLog`, `PfMcpOnLog`, to subscribe to logs. Automatically unsubscribed on shutdown.
 *
 * @alias ServerOnLogHandler
 * @alias DocsOnLogHandler
 */
type PfMcpOnLogHandler = ServerOnLogHandler | DocsOnLogHandler;

/**
 * The log event passed to the `onLog` handler, `PfMcpOnLogHandler`.
 *
 * @alias ServerLogEvent
 * @alias DocsLogEvent
 */
type PfMcpLogEvent = ServerLogEvent | DocsLogEvent;

/**
 * Get statistics about the server or docs instance.
 *
 * @alias ServerGetStats
 * @alias DocsGetStats
 */
type PfMcpGetStats = ServerGetStats | DocsGetStats;

/**
 * Statistics about the server or docs instance.
 *
 * @alias ServerStats
 * @alias DocsStats
 */
type PfMcpStats = ServerStats | DocsStats;

/**
 * Statistics report about the server or docs instance.
 *
 * @alias ServerStatReport
 * @alias DocsStatReport
 */
type PfMcpStatReport = ServerStatReport | DocsStatReport;

/**
 * Main function - Programmatic and CLI entry point with optional overrides.
 *
 * @param [pfMcpOptions] - User configurable options
 * @param [pfMcpSettings] - MCP server settings
 *
 * @returns {Promise<PfMcpInstance>} Server or documentation build instance with shutdown capability.
 *
 * @throws {Error} If `allowProcessExit` is set to `false` an error will be thrown rather than exiting
 *     the process. Server and documentation errors are noted as options or start failures.
 *
 * @example Programmatic: A MCP server with STDIO (Standard Input Output) transport.
 * import { start } from '@patternfly/patternfly-mcp';
 * const { stop, isRunning } = await start();
 *
 * if (isRunning()) {
 *   stop();
 * }
 *
 * @example Programmatic: A MCP server with HTTP transport.
 * import { start } from '@patternfly/patternfly-mcp';
 * const { stop, isRunning } = await start({ http: { port: 8000 } });
 *
 * if (isRunning()) {
 *   stop();
 * }
 *
 * @example Programmatic: Listening for server stats
 * import { subscribe, unsubscribe } from 'node:diagnostics_channel';
 * import { start, createMcpTool } from '@patternfly/patternfly-mcp';
 *
 * const { stop, isRunning, getStats } = await start();
 * const stats = await getStats();
 * const statsChannel = subscribe(stats.health.channelId, (healthStats: PfMcpHealthStats) => {
 *   stderr.write(`Health uptime: ${healthStats.uptime}\n`);
 * })
 *
 * if (isRunning()) {
 *   unsubscribe(stats.health.channelId);
 *   stop();
 * }
 *
 * @example Programmatic: A MCP server with inline tool configuration and JSON inputSchema.
 * import { start, createMcpTool } from '@patternfly/patternfly-mcp';
 *
 * const myToolModule = createMcpTool({
 *   name: 'my-tool',
 *   description: 'My tool description',
 *   inputSchema: { type: 'object', properties: {} },
 *   handler: async (args) => args
 * });
 *
 * const { stop, isRunning } = await start({ toolModules: [myToolModule] });
 *
 * if (isRunning()) {
 *   stop();
 * }
 *
 * @example Programmatic: A PatternFly documentation build.
 * import { start } from '@patternfly/patternfly-mcp';
 * const { stop, isRunning } = await start({ mode: 'docs' });
 *
 * if (isRunning()) {
 *   stop();
 * }
 */
const main = async (
  pfMcpOptions: PfMcpOptions = {},
  pfMcpSettings: PfMcpSettings = {}
): Promise<PfMcpInstance> => {
  const { mode: programmaticMode, ...options } = pfMcpOptions;
  const { allowProcessExit } = pfMcpSettings;

  // Check early for allowing process exits
  let updatedAllowProcessExit = allowProcessExit ?? programmaticMode !== 'test';
  let mergedOptions: GlobalOptions;

  // If allowed, exit the process on error otherwise log then throw the error.
  const processExit = (message: string, error: unknown) => {
    console.error(message, error);

    if (updatedAllowProcessExit) {
      process.exit(1);
    }

    throw error;
  };

  try {
    // Parse CLI options
    const { mode: cliMode, ...cliOptions } = parseCliOptions();

    // Apply `mode` separately because `cli.ts` applies it programmatically. Doing this allows us to set mode through `CLI options`.
    mergedOptions = setOptions({ ...cliOptions, ...options, mode: cliMode ?? programmaticMode });

    // Finalize exit policy after merging options
    updatedAllowProcessExit = allowProcessExit ?? mergedOptions.mode !== 'test';
  } catch (error) {
    processExit('Set options error, failed to start:', error);
  }

  try {
    // Generate session options
    const session = getSessionOptions();

    // Apply session values, then apply merged options to ensure stable hashing.
    return await runWithSession(session, async () => {
      // Start docs build mode or start the server
      const runInstance = mergedOptions.mode === 'docs' ? runDocs.memo : runServer.memo;

      return await runInstance(mergedOptions, { allowProcessExit: updatedAllowProcessExit });
    });
  } catch (error) {
    processExit(`Failed to start:`, error);
  }

  // Unreachable, processExit exits or throws. Kept for type satisfaction.
  return undefined as never;
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
  type PfMcpStatReport,
  type PfMcpStats,
  type PfMcpGetStats,
  type ToolCreator,
  type ToolModule,
  type ToolConfig,
  type ToolMultiConfig,
  type ToolExternalOptions,
  type ToolInternalOptions
};
