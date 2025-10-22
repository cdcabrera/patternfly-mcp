#!/usr/bin/env node

import { setOptions, parseCliOptions, type CliOptions } from './options';
import { runServer } from './server';

/**
 * Main function - CLI entry point with optional programmatic overrides
 *
 * @param programmaticOptions - Optional programmatic options that override CLI options
 */
const main = async (programmaticOptions?: Partial<CliOptions>): Promise<void> => {
  try {
    // Parse CLI options
    const cliOptions = parseCliOptions();

    // Merge programmatic options with CLI options (programmatic takes precedence)
    const finalOptions = { ...cliOptions, ...programmaticOptions };

    // Set options with CLI and programmatic overrides
    setOptions(finalOptions);

    // Create and run the server
    await runServer();
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

export { main, main as start, type CliOptions };
