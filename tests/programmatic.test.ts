/**
 * Programmatic API tests for the PatternFly MCP server.
 * This verifies the programmatic usage of start() function and OPTIONS management.
 * Focuses on sessionId verification and programmatic API behavior.
 */

import { start, type CliOptions } from '../src/index';
import { OPTIONS, parseCliOptions, freezeOptions } from '../src/options';

describe('Programmatic API Usage', () => {
  let originalArgv: string[];

  beforeEach(() => {
    // Store original process.argv
    originalArgv = process.argv;
  });

  afterEach(() => {
    // Restore original process.argv
    process.argv = originalArgv;
  });

  describe('Programmatic start() calls', () => {
    it('should handle multiple start() calls with different options and unique sessionIds', async () => {
      // First start() call
      const firstOptions: Partial<CliOptions> = { docsHost: true };

      start(firstOptions);

      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      const firstSessionId = OPTIONS.sessionId;

      // Second start() call with different options
      const secondOptions: Partial<CliOptions> = { docsHost: false };

      start(secondOptions);

      expect(OPTIONS.docsHost).toBe(false);
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);

      // Third start() call with no options
      start({});

      expect(OPTIONS.docsHost).toBe(false);
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);
    });

    it('should handle multiple start() calls with same options but unique sessionIds', async () => {
      const options: Partial<CliOptions> = { docsHost: true };

      // Multiple calls with same options
      start(options);
      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      const firstSessionId = OPTIONS.sessionId;

      start(options);
      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);

      start(options);
      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);
    });

    it('should handle start() calls with empty options and unique sessionIds', async () => {
      // Start with some value
      const initialOptions: Partial<CliOptions> = { docsHost: true };

      start(initialOptions);
      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      const firstSessionId = OPTIONS.sessionId;

      // Call with empty options - this will reset to default value
      start({});
      expect(OPTIONS.docsHost).toBe(false); // Will be reset to default
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);

      // Call with undefined options - this will also reset to default value
      start(undefined as any);
      expect(OPTIONS.docsHost).toBe(false); // Will be reset to default
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);
    });

    it('should create fresh instances for each start() call with unique sessionIds', async () => {
      const options: Partial<CliOptions> = { docsHost: true };

      // First call
      start(options);
      const firstDocsHost = OPTIONS.docsHost;
      const firstSessionId = OPTIONS.sessionId;

      // Second call with different options
      const secondOptions: Partial<CliOptions> = { docsHost: false };

      start(secondOptions);
      const secondDocsHost = OPTIONS.docsHost;
      const secondSessionId = OPTIONS.sessionId;

      // Third call with original options
      start(options);
      const thirdDocsHost = OPTIONS.docsHost;
      const thirdSessionId = OPTIONS.sessionId;

      // Verify values changed as expected
      expect(firstDocsHost).toBe(true);
      expect(secondDocsHost).toBe(false);
      expect(thirdDocsHost).toBe(true);

      // Verify all sessionIds are different
      expect(firstSessionId).not.toBe(secondSessionId);
      expect(secondSessionId).not.toBe(thirdSessionId);
      expect(firstSessionId).not.toBe(thirdSessionId);
    });

    it('should handle concurrent start() calls with unique sessionIds', async () => {
      const options1: Partial<CliOptions> = { docsHost: true };
      const options2: Partial<CliOptions> = { docsHost: false };

      // Start multiple calls concurrently
      start(options1);
      const firstSessionId = OPTIONS.sessionId;

      start(options2);
      const secondSessionId = OPTIONS.sessionId;

      start({});
      const thirdSessionId = OPTIONS.sessionId;

      // OPTIONS should reflect the last call
      expect(OPTIONS.docsHost).toBe(false);

      // Verify all sessionIds are different
      expect(firstSessionId).not.toBe(secondSessionId);
      expect(secondSessionId).not.toBe(thirdSessionId);
      expect(firstSessionId).not.toBe(thirdSessionId);
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
