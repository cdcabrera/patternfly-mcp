#!/usr/bin/env node

import { parseCliOptions, type CliOptions } from './options';
import { setOptions } from './options.context';
import { runServer, type ServerInstance } from './server';

/**
 * Options for programmatic usage.
 *
 * Extends the CliOptions interface to provide additional configuration
 * specific to programmatic interaction.
 *
 * The `mode` property allows specifying the context of usage.
 * - If set to 'cli' or 'programmatic', it allows process exits.
 * - If set to 'test', it will NOT allow process exits.
 */
interface ProgrammaticOptions extends CliOptions {
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
interface ProgrammaticSettings {
  allowProcessExit?: boolean;
}

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
  programmaticOptions?: Partial<ProgrammaticOptions>,
  { allowProcessExit }: ProgrammaticSettings = {}
): Promise<ServerInstance> => {
  const updatedAllowProcessExit = allowProcessExit ?? programmaticOptions?.mode !== 'test';

  try {
    const cliOptions = parseCliOptions();

    // Apply options to context. setOptions merges with DEFAULT_OPTIONS internally
    setOptions({ ...cliOptions, ...programmaticOptions });

    return await runServer.memo(undefined, { allowProcessExit: updatedAllowProcessExit });
  } catch (error) {
    console.error('Failed to start server:', error);

    if (updatedAllowProcessExit) {
      process.exit(1);
    } else {
      throw error;
    }
  }
};

// Start the server
if (process.env.NODE_ENV !== 'local') {
  main({ mode: 'cli' }).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export {
  main,
  main as start,
  type CliOptions,
  type ProgrammaticOptions,
  type ProgrammaticSettings,
  type ServerInstance
};
