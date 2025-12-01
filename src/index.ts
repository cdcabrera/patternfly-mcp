#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCliOptions, type CliOptions, type DefaultOptions } from './options';
import { setOptions } from './options.context';
import { runServer, type ServerInstance, type ServerSettings } from './server';

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
interface PfMcpOptions extends DefaultOptions {
  mode?: 'cli' | 'programmatic' | 'test';
}

/**
 * Additional settings for programmatic control.
 *
 * `allowProcessExit` is disabled for `test` use by default.
 * You can enable/disable it directly or via the `mode` property.
 * - Sets to `true` when `mode=cli` or `mode=programmatic` or undefined.
 * - Sets to `false` when `mode=test`.
 *
 * @property {boolean} allowProcessExit - Override process exits. Useful for tests
 *     or programmatic use to avoid exiting.
 *     - Providing this property overrides the `mode` property.
 *     - Defaults to `true` when `mode=cli` or `mode=programmatic` or undefined.
 *     - Defaults to `false` when `mode=test`.
 */
type PfMcpSettings = Pick<ServerSettings, 'allowProcessExit'>;

/**
 * Main function - CLI entry point with optional programmatic overrides
 *
 * @param [pfMcpOptions] - User configurable options
 * @param [pfMcpSettings] - MCP server settings
 *
 * @returns {Promise<ServerInstance>} Server-instance with shutdown capability
 *
 * @throws {Error} If the server fails to start or any error occurs during initialization,
 *     and `allowProcessExit` is set to `false`, the error will be thrown rather than exiting
 *     the process.
 */
const main = async (
  pfMcpOptions: Partial<PfMcpOptions> = {},
  pfMcpSettings: PfMcpSettings = {}
): Promise<ServerInstance> => {
  const { mode, ...options } = pfMcpOptions;
  const { allowProcessExit } = pfMcpSettings;

  const modes = ['cli', 'programmatic', 'test'];
  const updatedMode = mode && modes.includes(mode) ? mode : 'programmatic';
  const updatedAllowProcessExit = allowProcessExit ?? updatedMode !== 'test';

  try {
    const cliOptions = parseCliOptions();
    const mergedOptions = setOptions({ ...cliOptions, ...options });

    // `runServer` doesn't require it, but `memo` does for "uniqueness", pass in the merged options for a hashable argument
    return await runServer.memo(mergedOptions, { allowProcessExit: updatedAllowProcessExit });
  } catch (error) {
    console.error('Failed to start server:', error);

    if (updatedAllowProcessExit) {
      process.exit(1);
    } else {
      throw error;
    }
  }
};

/**
 * Confirm CLI mode, on success start the server.
 */
const cli = async () => {
  let isCli = false;

  try {
    isCli = typeof process.argv[1] === 'string' && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
  } catch {}

  if (isCli) {
    main({ mode: 'cli' }).catch(error => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
  }
};

// CLI startup check
cli();

export {
  main,
  main as start,
  type CliOptions,
  type PfMcpOptions,
  type PfMcpSettings,
  type ServerInstance
};
