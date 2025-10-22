/**
 * CLI functionality tests for the PatternFly MCP server.
 * This verifies CLI argument parsing and integration with options management.
 * Focuses on CLI-specific functionality and parsing behavior.
 */

import { OPTIONS, parseCliOptions, setOptions } from '../src/options';

describe('CLI Functionality', () => {
  let originalArgv: string[];

  beforeEach(() => {
    // Store original process.argv
    originalArgv = process.argv;
  });

  afterEach(() => {
    // Restore original process.argv
    process.argv = originalArgv;
  });

  describe('CLI Usage', () => {
    it('should handle CLI with --docs-host flag', async () => {
      process.argv = ['node', 'script.js', '--docs-host'];

      // Test parseCliOptions
      const cliOptions = parseCliOptions();

      expect(cliOptions.docsHost).toBe(true);

      // Test setOptions() with CLI options
      setOptions(cliOptions);
      expect(OPTIONS.docsHost).toBe(true);
    });

    it('should handle CLI without --docs-host flag', async () => {
      process.argv = ['node', 'script.js'];

      // Test parseCliOptions
      const cliOptions = parseCliOptions();

      expect(cliOptions.docsHost).toBe(false);

      // Test setOptions with CLI options
      setOptions(cliOptions);
      expect(OPTIONS.docsHost).toBe(false);

      // Test setOptions() with CLI options
      setOptions(cliOptions);
      expect(OPTIONS.docsHost).toBe(false);
    });

    it('should handle CLI with other arguments', async () => {
      process.argv = ['node', 'script.js', '--other-flag', 'value'];

      // Test parseCliOptions
      const cliOptions = parseCliOptions();

      expect(cliOptions.docsHost).toBe(false);

      // Test setOptions with CLI options
      setOptions(cliOptions);
      expect(OPTIONS.docsHost).toBe(false);

      // Test setOptions() with CLI options
      setOptions(cliOptions);
      expect(OPTIONS.docsHost).toBe(false);
    });

    it('should handle multiple CLI calls', async () => {
      // First CLI call with --docs-host
      process.argv = ['node', 'script.js', '--docs-host'];
      const cliOptions1 = parseCliOptions();

      setOptions(cliOptions1);
      setOptions(cliOptions1);

      expect(cliOptions1.docsHost).toBe(true);
      expect(OPTIONS.docsHost).toBe(true);

      // Second CLI call without --docs-host
      process.argv = ['node', 'script.js'];
      const cliOptions2 = parseCliOptions();

      setOptions(cliOptions2);
      setOptions(cliOptions2);

      expect(cliOptions2.docsHost).toBe(false);
      expect(OPTIONS.docsHost).toBe(false);
    });
  });
});
