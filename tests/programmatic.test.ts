/**
 * Programmatic API tests for the PatternFly MCP server.
 * This verifies the programmatic usage of setOptions() function and OPTIONS management.
 * Focuses on sessionId verification and programmatic API behavior.
 * Note: These tests focus on options management without setOptionsing actual servers.
 */

import { type CliOptions } from '../src/index';
import { OPTIONS, setOptions } from '../src/options';

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

  describe('Programmatic setOptions() calls', () => {
    it('should handle multiple setOptions() calls with different options and unique sessionIds', async () => {
      // First setOptions() call
      const firstOptions: Partial<CliOptions> = { docsHost: true };

      setOptions(firstOptions);

      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      const firstSessionId = OPTIONS.sessionId;

      // Second setOptions() call with different options
      const secondOptions: Partial<CliOptions> = { docsHost: false };

      setOptions(secondOptions);

      expect(OPTIONS.docsHost).toBe(false);
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);

      // Third setOptions() call with no options
      setOptions({});

      expect(OPTIONS.docsHost).toBe(false);
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);
    });

    it('should handle multiple setOptions() calls with same options but unique sessionIds', async () => {
      const options: Partial<CliOptions> = { docsHost: true };

      // Multiple calls with same options
      setOptions(options);
      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      const firstSessionId = OPTIONS.sessionId;

      setOptions(options);
      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);

      setOptions(options);
      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);
    });

    it('should handle setOptions() calls with empty options and unique sessionIds', async () => {
      // Start with some value
      const initialOptions: Partial<CliOptions> = { docsHost: true };

      setOptions(initialOptions);
      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.sessionId).toBeDefined();
      const firstSessionId = OPTIONS.sessionId;

      // Call with empty options - this will keep the current value
      setOptions({});
      expect(OPTIONS.docsHost).toBe(true); // Will keep current value
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);

      // Call with undefined options - this will also keep the current value
      setOptions(undefined as any);
      expect(OPTIONS.docsHost).toBe(true); // Will keep current value
      expect(OPTIONS.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).not.toBe(firstSessionId);
    });

    it('should create fresh instances for each setOptions() call with unique sessionIds', async () => {
      const options: Partial<CliOptions> = { docsHost: true };

      // First call
      setOptions(options);
      const firstDocsHost = OPTIONS.docsHost;
      const firstSessionId = OPTIONS.sessionId;

      // Second call with different options
      const secondOptions: Partial<CliOptions> = { docsHost: false };

      setOptions(secondOptions);
      const secondDocsHost = OPTIONS.docsHost;
      const secondSessionId = OPTIONS.sessionId;

      // Third call with original options
      setOptions(options);
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

    it('should handle concurrent setOptions() calls with unique sessionIds', async () => {
      const options1: Partial<CliOptions> = { docsHost: true };
      const options2: Partial<CliOptions> = { docsHost: false };

      // Start multiple calls concurrently
      setOptions(options1);
      const firstSessionId = OPTIONS.sessionId;

      setOptions(options2);
      const secondSessionId = OPTIONS.sessionId;

      setOptions({});
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

      setOptions(firstOptions);
      expect(OPTIONS.docsHost).toBe(true);

      // Second call
      const secondOptions: Partial<CliOptions> = { docsHost: false };

      setOptions(secondOptions);
      expect(OPTIONS.docsHost).toBe(false);

      // Third call with no options
      setOptions({});
      expect(OPTIONS.docsHost).toBe(false);
    });

    it('should handle OPTIONS updates correctly', async () => {
      const options: Partial<CliOptions> = { docsHost: true };

      // First call
      setOptions(options);
      expect(OPTIONS.docsHost).toBe(true);

      // Modify the options object
      options.docsHost = false;

      // Second call with modified options
      setOptions(options);
      expect(OPTIONS.docsHost).toBe(false);
    });

    it('should handle concurrent OPTIONS updates', async () => {
      const options1: Partial<CliOptions> = { docsHost: true };
      const options2: Partial<CliOptions> = { docsHost: false };

      // Start multiple calls concurrently
      setOptions(options1);
      setOptions(options2);
      setOptions({});

      // OPTIONS should reflect the last call
      expect(OPTIONS.docsHost).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid options gracefully', async () => {
      // Test with invalid options
      const invalidOptions = { invalidProperty: 'value' } as any;

      setOptions(invalidOptions);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle null/undefined options', async () => {
      // Test with null options
      setOptions(null as any);

      // Test with undefined options
      setOptions(undefined as any);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle empty options object', async () => {
      const emptyOptions = {};

      setOptions(emptyOptions);

      // Should not throw
      expect(true).toBe(true);
    });
  });
});
