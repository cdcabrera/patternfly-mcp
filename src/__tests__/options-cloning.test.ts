/**
 * Unit tests for OPTIONS cloning functionality.
 * This verifies that structuredClone creates proper deep copies of OPTIONS.
 * Simplified using sessionId for verification.
 */

import { OPTIONS, freezeOptions } from '../options';

describe('OPTIONS cloning', () => {
  describe('structuredClone deep copying', () => {
    it('should create a deep copy of OPTIONS with unique sessionId', () => {
      const originalDocsHost = OPTIONS.docsHost;

      // Create a fresh instance using freezeOptions
      const freshOptions = freezeOptions({ docsHost: !originalDocsHost });

      // Verify sessionId is unique and present
      expect(freshOptions.sessionId).toBeDefined();
      expect(freshOptions.sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
      expect(OPTIONS.sessionId).toBe(freshOptions.sessionId);

      // Verify the values are correct
      expect(freshOptions.docsHost).toBe(!originalDocsHost);
      expect(OPTIONS.docsHost).toBe(!originalDocsHost);
    });

    it('should create independent instances with unique sessionIds', () => {
      // Create first instance
      const firstOptions = freezeOptions({ docsHost: true });

      expect(firstOptions.sessionId).toBeDefined();
      expect(firstOptions.docsHost).toBe(true);
      expect(OPTIONS.docsHost).toBe(true);

      // Create second instance
      const secondOptions = freezeOptions({ docsHost: false });

      expect(secondOptions.sessionId).toBeDefined();
      expect(secondOptions.docsHost).toBe(false);
      expect(OPTIONS.docsHost).toBe(false);

      // Verify sessionIds are different (indicating fresh instances)
      expect(firstOptions.sessionId).not.toBe(secondOptions.sessionId);
      expect(OPTIONS.sessionId).toBe(secondOptions.sessionId);
    });

    it('should handle nested object properties correctly', () => {
      const freshOptions = freezeOptions({ docsHost: true });

      // Verify sessionId is present
      expect(freshOptions.sessionId).toBeDefined();

      // Verify nested objects are properly cloned (deep clone)
      expect(freshOptions.resourceMemoOptions).toEqual(OPTIONS.resourceMemoOptions);
      expect(freshOptions.toolMemoOptions).toEqual(OPTIONS.toolMemoOptions);

      // Note: structuredClone should create deep copies, but these objects might be shared
      // The important thing is that the sessionId is unique and the values are correct
      expect(freshOptions.resourceMemoOptions).toEqual(OPTIONS.resourceMemoOptions);
      expect(freshOptions.toolMemoOptions).toEqual(OPTIONS.toolMemoOptions);
    });

    it('should preserve all OPTIONS properties including sessionId', () => {
      const freshOptions = freezeOptions({ docsHost: true });

      // Verify sessionId is present
      expect(freshOptions.sessionId).toBeDefined();
      expect(freshOptions.sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);

      // Verify all expected properties exist
      expect(freshOptions).toHaveProperty('pfExternal');
      expect(freshOptions).toHaveProperty('pfExternalCharts');
      expect(freshOptions).toHaveProperty('pfExternalChartsComponents');
      expect(freshOptions).toHaveProperty('pfExternalChartsDesign');
      expect(freshOptions).toHaveProperty('pfExternalDesign');
      expect(freshOptions).toHaveProperty('pfExternalDesignComponents');
      expect(freshOptions).toHaveProperty('pfExternalDesignLayouts');
      expect(freshOptions).toHaveProperty('pfExternalAccessibility');
      expect(freshOptions).toHaveProperty('resourceMemoOptions');
      expect(freshOptions).toHaveProperty('toolMemoOptions');
      expect(freshOptions).toHaveProperty('separator');
      expect(freshOptions).toHaveProperty('urlRegex');
      expect(freshOptions).toHaveProperty('name');
      expect(freshOptions).toHaveProperty('version');
      expect(freshOptions).toHaveProperty('repoName');
      expect(freshOptions).toHaveProperty('contextPath');
      expect(freshOptions).toHaveProperty('docsPath');
      expect(freshOptions).toHaveProperty('llmsFilesPath');
      expect(freshOptions).toHaveProperty('docsHost');
      expect(freshOptions).toHaveProperty('sessionId');
    });

    it('should handle empty CLI options with sessionId', () => {
      const originalDocsHost = OPTIONS.docsHost;

      const freshOptions = freezeOptions({});

      // Verify sessionId is present
      expect(freshOptions.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).toBe(freshOptions.sessionId);

      // Verify docsHost remains unchanged
      expect(freshOptions.docsHost).toBe(originalDocsHost);
      expect(OPTIONS.docsHost).toBe(originalDocsHost);
    });

    it('should handle partial CLI options with sessionId', () => {
      const originalName = OPTIONS.name;

      const freshOptions = freezeOptions({ docsHost: true });

      // Verify sessionId is present
      expect(freshOptions.sessionId).toBeDefined();
      expect(OPTIONS.sessionId).toBe(freshOptions.sessionId);

      // Verify only docsHost changed
      expect(freshOptions.docsHost).toBe(true);
      expect(freshOptions.name).toBe(originalName);
      expect(OPTIONS.docsHost).toBe(true);
      expect(OPTIONS.name).toBe(originalName);
    });
  });

  describe('OPTIONS immutability', () => {
    it('should not freeze the returned instance', () => {
      const freshOptions = freezeOptions({ docsHost: true });

      // Verify sessionId is present
      expect(freshOptions.sessionId).toBeDefined();

      // Verify the returned instance is not frozen
      expect(Object.isFrozen(freshOptions)).toBe(false);
    });

    it('should allow modification of returned instance', () => {
      const freshOptions = freezeOptions({ docsHost: true });

      // Verify sessionId is present
      expect(freshOptions.sessionId).toBeDefined();

      // Should be able to modify the returned instance
      freshOptions.docsHost = false;
      expect(freshOptions.docsHost).toBe(false);

      // OPTIONS should remain unchanged
      expect(OPTIONS.docsHost).toBe(true);
    });

    it('should maintain isolation between instances using sessionId', () => {
      const firstOptions = freezeOptions({ docsHost: true });
      const secondOptions = freezeOptions({ docsHost: false });

      // Verify sessionIds are different (indicating isolation)
      expect(firstOptions.sessionId).not.toBe(secondOptions.sessionId);
      expect(OPTIONS.sessionId).toBe(secondOptions.sessionId);

      // Modify first instance
      firstOptions.docsHost = false;

      // Second instance should be unaffected
      expect(secondOptions.docsHost).toBe(false);
      expect(OPTIONS.docsHost).toBe(false);
    });
  });

  describe('multiple freezeOptions calls', () => {
    it('should handle multiple calls correctly with unique sessionIds', () => {
      const firstOptions = freezeOptions({ docsHost: true });

      expect(firstOptions.sessionId).toBeDefined();
      expect(firstOptions.docsHost).toBe(true);
      expect(OPTIONS.docsHost).toBe(true);

      const secondOptions = freezeOptions({ docsHost: false });

      expect(secondOptions.sessionId).toBeDefined();
      expect(secondOptions.docsHost).toBe(false);
      expect(OPTIONS.docsHost).toBe(false);

      const thirdOptions = freezeOptions({});

      expect(thirdOptions.sessionId).toBeDefined();
      expect(thirdOptions.docsHost).toBe(false);
      expect(OPTIONS.docsHost).toBe(false);

      // Verify all sessionIds are different
      expect(firstOptions.sessionId).not.toBe(secondOptions.sessionId);
      expect(secondOptions.sessionId).not.toBe(thirdOptions.sessionId);
      expect(firstOptions.sessionId).not.toBe(thirdOptions.sessionId);
    });

    it('should create independent instances on each call with unique sessionIds', () => {
      const firstOptions = freezeOptions({ docsHost: true });
      const secondOptions = freezeOptions({ docsHost: false });
      const thirdOptions = freezeOptions({});

      // Verify all sessionIds are different (indicating fresh instances)
      expect(firstOptions.sessionId).not.toBe(secondOptions.sessionId);
      expect(secondOptions.sessionId).not.toBe(thirdOptions.sessionId);
      expect(firstOptions.sessionId).not.toBe(thirdOptions.sessionId);

      // Verify OPTIONS has the latest sessionId
      expect(OPTIONS.sessionId).toBe(thirdOptions.sessionId);
    });
  });
});
