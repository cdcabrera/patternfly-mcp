#!/usr/bin/env node

import { createOptions, parseCliOptions, type CliOptions } from './options';
import { setOptions } from './options.context';
import { runServer, type ServerInstance } from './server';

/**
 * Main function - CLI entry point with optional programmatic overrides
 *
 * @param programmaticOptions - Optional programmatic options that override CLI options
 * @returns {Promise<ServerInstance>} Server-instance with shutdown capability
 */
const main = async (programmaticOptions?: Partial<CliOptions>): Promise<ServerInstance> => {
  try {
    // Parse CLI options
    const cliOptions = parseCliOptions();

    // Merge programmatic options with CLI options (programmatic takes precedence)
    const finalOptions = { ...cliOptions, ...programmaticOptions };

    // Create options and set in context (frozen per-context, not globally)
    // This allows multiple server instances to have different options
    const options = createOptions(finalOptions);

    setOptions(options);

    // Create and return server-instance
    return await runServer();
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
if (process.env.NODE_ENV !== 'local') {
  main().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { main, main as start, type CliOptions, type ServerInstance };
