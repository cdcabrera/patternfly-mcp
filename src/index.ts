#!/usr/bin/env node

// import { fileURLToPath } from 'node:url';
import { parseCliOptions, type CliOptions } from './options';
import { setOptions } from './options.context';
import { runServer, type ServerInstance, type ServerSettings } from './server';

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
  programmaticOptions?: Partial<ProgrammaticOptions>,
  { allowProcessExit }: ProgrammaticSettings = {}
): Promise<ServerInstance> => {
  const updatedAllowProcessExit = allowProcessExit ?? programmaticOptions?.mode !== 'test';

  try {
    const cliOptions = parseCliOptions();
    const mergedOptions = setOptions({ ...cliOptions, ...programmaticOptions });

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

/*
const isMain = import.meta.url === new URL(process.argv[1], 'file:').href;

if (isMain) {
  main({ mode: 'cli' }).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
 */

try {
  const isCli = process.env.NODE_ENV !== 'local' ||
    (typeof process.argv[1] === 'string' && import.meta.url === new URL(process.argv[1], 'file:').href);

  if (isCli) {
    main({ mode: 'cli' }).catch(error => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
  }
} catch (error) {
  console.error(error);
}

export {
  main,
  main as start,
  type CliOptions,
  type ProgrammaticOptions,
  type ProgrammaticSettings,
  type ServerInstance
};
