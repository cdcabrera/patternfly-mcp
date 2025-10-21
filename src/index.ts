#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCliOptions, type CliOptions, type DefaultOptions } from './options';
import { setOptions } from './options.context';
import { runServer, type ServerInstance, type ServerSettings } from './server';

/**
 * Options for programmatic usage. Extends the CliOptions interface.
 *
 * `ProgrammaticOptions` introduces an additional optional property
 * `mode`. The `mode` property allows specifying the context of usage.
 * - If set to 'cli' or 'programmatic', it allows process exits.
 * - If set to 'test', it will NOT allow process exits.
 *
 * Properties:
 * - `mode`: Optional string property that specifies the mode of operation.
 *   It can take one of the following values:
 *     - `'cli'`: Functionality is being executed in a command-line interface context.
 *     - `'programmatic'`: Functionality is invoked programmatically.
 *     - `'test'`: Functionality is being tested.
 */
interface ProgrammaticOptions extends Partial<DefaultOptions> {
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
 * Properties:
 * - `allowProcessExit` (optional): Override process exits.
 */
type ProgrammaticSettings = Pick<ServerSettings, 'allowProcessExit'>;

/**
 * Main function - CLI entry point with optional programmatic overrides
 *
 * @param {Partial<ProgrammaticOptions>} [programmaticOptions] - Optional programmatic options that override CLI options
 * @param options - Additional options for controlling behavior.
 * @param [options.allowProcessExit=true] - Determines whether the process should exit on failure.
 *     Useful for tests or programmatic use to avoid exiting.
 * @returns {Promise<ServerInstance>} Server-instance with shutdown capability
 *
 * @throws {Error} If the server fails to start or any error occurs during initialization,
 *     and `allowProcessExit` is set to `false`, the error will be thrown rather than exiting
 *     the process.
 */
const main = async (
  programmaticOptions?: ProgrammaticOptions,
  { allowProcessExit }: ProgrammaticSettings = {}
): Promise<ServerInstance> => {
  const updatedAllowProcessExit = allowProcessExit ?? programmaticOptions?.mode !== 'test';

  try {
    const cliOptions = parseCliOptions();
    const mergedOptions = setOptions({ ...cliOptions, ...programmaticOptions });

    // `runServer` doesn't require it, but `memo` does for "uniqueness", pass in the merged options for a hashable argument
    return await runServer.memo(mergedOptions, { allowProcessExit: updatedAllowProcessExit });
  } catch (error) {
    // Use console.error, log.error requires initialization
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
  type ProgrammaticOptions as PfMcpOptions,
  type ProgrammaticSettings as PfMcpSettings,
  type ServerInstance
};
