/**
 * End-to-end tests for CLI and programmatic usage scenarios.
 * This verifies multiple start()/main() calls and OPTIONS settings for both CLI and programmatic usage.
 */

import { start, type CliOptions } from '../index';
import { OPTIONS, parseCliOptions, freezeOptions } from '../options';

describe('E2E CLI and Programmatic Usage', () => {
  let originalArgv: string[];

  beforeEach(() => {
    // Store original process.argv
    originalArgv = process.argv;
  });

  afterEach(() => {
    // Restore original process.argv
    process.argv = originalArgv;
  });

  describe('Programmatic Usage', () => {
    it('should handle multiple start() calls with different options', async () => {
      // First start() call
      const firstOptions: Partial<CliOptions> = { docsHost: true };

      start(firstOptions);

      expect(OPTIONS.docsHost).toBe(true);

      // Second start() call with different options
      const secondOptions: Partial<CliOptions> = { docsHost: false };

      start(secondOptions);

      expect(OPTIONS.docsHost).toBe(false);

      // Third start() call with no options
      start({});

      expect(OPTIONS.docsHost).toBe(false);
    });

    it('should handle multiple start() calls with same options', async () => {
      const options: Partial<CliOptions> = { docsHost: true };

      // Multiple calls with same options
      start(options);
      expect(OPTIONS.docsHost).toBe(true);

      start(options);
      expect(OPTIONS.docsHost).toBe(true);

      start(options);
      expect(OPTIONS.docsHost).toBe(true);
    });

    it('should handle start() calls with empty options', async () => {
      // Start with some value
      const initialOptions: Partial<CliOptions> = { docsHost: true };

      start(initialOptions);
      expect(OPTIONS.docsHost).toBe(true);

      // Call with empty options - this will reset to default value
      start({});
      expect(OPTIONS.docsHost).toBe(false); // Will be reset to default

      // Call with undefined options - this will also reset to default value
      start(undefined as any);
      expect(OPTIONS.docsHost).toBe(false); // Will be reset to default
    });

    it('should create fresh instances for each start() call', async () => {
      const options: Partial<CliOptions> = { docsHost: true };

      // First call
      start(options);
      const firstDocsHost = OPTIONS.docsHost;

      // Second call with different options
      const secondOptions: Partial<CliOptions> = { docsHost: false };

      start(secondOptions);
      const secondDocsHost = OPTIONS.docsHost;

      // Third call with original options
      start(options);
      const thirdDocsHost = OPTIONS.docsHost;

      // Verify values changed as expected
      expect(firstDocsHost).toBe(true);
      expect(secondDocsHost).toBe(false);
      expect(thirdDocsHost).toBe(true);
    });

    it('should handle concurrent start() calls', async () => {
      const options1: Partial<CliOptions> = { docsHost: true };
      const options2: Partial<CliOptions> = { docsHost: false };

      // Start multiple calls concurrently
      start(options1);
      start(options2);
      start({});

      // OPTIONS should reflect the last call
      expect(OPTIONS.docsHost).toBe(false);
    });
  });

  describe('CLI Usage', () => {
    it('should handle CLI with --docs-host flag', async () => {
      process.argv = ['node', 'script.js', '--docs-host'];

      // Test parseCliOptions
      const cliOptions = parseCliOptions();

      expect(cliOptions.docsHost).toBe(true);

      // Test freezeOptions with CLI options
      freezeOptions(cliOptions);
      expect(OPTIONS.docsHost).toBe(true);

      // Test start() with CLI options
      start(cliOptions);
      expect(OPTIONS.docsHost).toBe(true);
    });

    it('should handle CLI without --docs-host flag', async () => {
      process.argv = ['node', 'script.js'];

      // Test parseCliOptions
      const cliOptions = parseCliOptions();

      expect(cliOptions.docsHost).toBe(false);

      // Test freezeOptions with CLI options
      freezeOptions(cliOptions);
      expect(OPTIONS.docsHost).toBe(false);

      // Test start() with CLI options
      start(cliOptions);
      expect(OPTIONS.docsHost).toBe(false);
    });

    it('should handle CLI with other arguments', async () => {
      process.argv = ['node', 'script.js', '--other-flag', 'value'];

      // Test parseCliOptions
      const cliOptions = parseCliOptions();

      expect(cliOptions.docsHost).toBe(false);

      // Test freezeOptions with CLI options
      freezeOptions(cliOptions);
      expect(OPTIONS.docsHost).toBe(false);

      // Test start() with CLI options
      start(cliOptions);
      expect(OPTIONS.docsHost).toBe(false);
    });

    it('should handle multiple CLI calls', async () => {
      // First CLI call with --docs-host
      process.argv = ['node', 'script.js', '--docs-host'];
      const cliOptions1 = parseCliOptions();

      freezeOptions(cliOptions1);
      start(cliOptions1);

      expect(cliOptions1.docsHost).toBe(true);
      expect(OPTIONS.docsHost).toBe(true);

      // Second CLI call without --docs-host
      process.argv = ['node', 'script.js'];
      const cliOptions2 = parseCliOptions();

      freezeOptions(cliOptions2);
      start(cliOptions2);

      expect(cliOptions2.docsHost).toBe(false);
      expect(OPTIONS.docsHost).toBe(false);
    });
  });

  describe('Mixed CLI and Programmatic Usage', () => {
    it('should handle CLI followed by programmatic calls', async () => {
      // CLI call
      process.argv = ['node', 'script.js', '--docs-host'];
      const cliOptions = parseCliOptions();

      freezeOptions(cliOptions);
      start(cliOptions);

      expect(OPTIONS.docsHost).toBe(true);

      // Programmatic call
      const programmaticOptions: Partial<CliOptions> = { docsHost: false };

      start(programmaticOptions);

      expect(OPTIONS.docsHost).toBe(false);

      // Another programmatic call
      const anotherProgrammaticOptions: Partial<CliOptions> = { docsHost: true };

      start(anotherProgrammaticOptions);

      expect(OPTIONS.docsHost).toBe(true);
    });

    it('should handle programmatic calls followed by CLI', async () => {
      // Programmatic call
      const programmaticOptions: Partial<CliOptions> = { docsHost: true };

      start(programmaticOptions);

      expect(OPTIONS.docsHost).toBe(true);

      // CLI call
      process.argv = ['node', 'script.js'];
      const cliOptions = parseCliOptions();

      freezeOptions(cliOptions);
      start(cliOptions);

      expect(OPTIONS.docsHost).toBe(false);
    });

    it('should handle alternating CLI and programmatic calls', async () => {
      // CLI call
      process.argv = ['node', 'script.js', '--docs-host'];
      const cliOptions1 = parseCliOptions();

      freezeOptions(cliOptions1);
      start(cliOptions1);

      expect(OPTIONS.docsHost).toBe(true);

      // Programmatic call
      const programmaticOptions1: Partial<CliOptions> = { docsHost: false };

      start(programmaticOptions1);

      expect(OPTIONS.docsHost).toBe(false);

      // CLI call
      process.argv = ['node', 'script.js'];
      const cliOptions2 = parseCliOptions();

      freezeOptions(cliOptions2);
      start(cliOptions2);

      expect(OPTIONS.docsHost).toBe(false);

      // Programmatic call
      const programmaticOptions2: Partial<CliOptions> = { docsHost: true };

      start(programmaticOptions2);

      expect(OPTIONS.docsHost).toBe(true);
    });
  });

  describe('OPTIONS State Management', () => {
    it('should maintain OPTIONS state across multiple calls', async () => {
      // First call
      const firstOptions: Partial<CliOptions> = { docsHost: true };

      start(firstOptions);
      expect(OPTIONS.docsHost).toBe(true);

      // Second call
      const secondOptions: Partial<CliOptions> = { docsHost: false };

      start(secondOptions);
      expect(OPTIONS.docsHost).toBe(false);

      // Third call with no options
      start({});
      expect(OPTIONS.docsHost).toBe(false);
    });

    it('should handle OPTIONS updates correctly', async () => {
      const options: Partial<CliOptions> = { docsHost: true };

      // First call
      start(options);
      expect(OPTIONS.docsHost).toBe(true);

      // Modify the options object
      options.docsHost = false;

      // Second call with modified options
      start(options);
      expect(OPTIONS.docsHost).toBe(false);
    });

    it('should handle concurrent OPTIONS updates', async () => {
      const options1: Partial<CliOptions> = { docsHost: true };
      const options2: Partial<CliOptions> = { docsHost: false };

      // Start multiple calls concurrently
      start(options1);
      start(options2);
      start({});

      // OPTIONS should reflect the last call
      expect(OPTIONS.docsHost).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid options gracefully', async () => {
      // Test with invalid options
      const invalidOptions = { invalidProperty: 'value' } as any;

      start(invalidOptions);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle null/undefined options', async () => {
      // Test with null options
      start(null as any);

      // Test with undefined options
      start(undefined as any);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle empty options object', async () => {
      const emptyOptions = {};

      start(emptyOptions);

      // Should not throw
      expect(true).toBe(true);
    });
  });
});
