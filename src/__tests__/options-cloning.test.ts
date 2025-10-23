/**
 * Unit tests for OPTIONS cloning functionality.
 * This verifies that structuredClone creates proper deep copies of OPTIONS.
 */

import { OPTIONS, freezeOptions } from '../options';

describe('OPTIONS cloning', () => {
  describe('structuredClone deep copying', () => {
    it('should create a deep copy of OPTIONS', () => {
      const originalDocsHost = OPTIONS.docsHost;
      const originalName = OPTIONS.name;
      const originalVersion = OPTIONS.version;

      // Create a fresh instance using freezeOptions
      const freshOptions = freezeOptions({ docsHost: !originalDocsHost });

      // Verify it's a different object
      expect(freshOptions).not.toBe(OPTIONS);

      // Verify the values are correct
      expect(freshOptions.docsHost).toBe(!originalDocsHost);
      expect(freshOptions.name).toBe(originalName);
      expect(freshOptions.version).toBe(originalVersion);

      // Verify OPTIONS was updated
      expect(OPTIONS.docsHost).toBe(!originalDocsHost);
    });

    it('should create independent instances', () => {
      // Create first instance
      const firstOptions = freezeOptions({ docsHost: true });

      expect(firstOptions).not.toBe(OPTIONS);
      expect(firstOptions.docsHost).toBe(true);
      expect(OPTIONS.docsHost).toBe(true);

      // Create second instance
      const secondOptions = freezeOptions({ docsHost: false });

      expect(secondOptions).not.toBe(OPTIONS);
      expect(secondOptions.docsHost).toBe(false);
      expect(OPTIONS.docsHost).toBe(false);

      // Verify instances are independent
      expect(firstOptions).not.toBe(secondOptions);
      expect(firstOptions.docsHost).not.toBe(secondOptions.docsHost);
    });

    it('should handle nested object properties correctly', () => {
      const originalResourceMemoOptions = OPTIONS.resourceMemoOptions;
      const originalToolMemoOptions = OPTIONS.toolMemoOptions;

      const freshOptions = freezeOptions({ docsHost: true });

      // Verify nested objects are properly cloned
      expect(freshOptions.resourceMemoOptions).toEqual(originalResourceMemoOptions);
      expect(freshOptions.toolMemoOptions).toEqual(originalToolMemoOptions);

      // Verify they are different objects (deep clone)
      expect(freshOptions.resourceMemoOptions).not.toBe(originalResourceMemoOptions);
      expect(freshOptions.toolMemoOptions).not.toBe(originalToolMemoOptions);
    });

    it('should preserve all OPTIONS properties', () => {
      const freshOptions = freezeOptions({ docsHost: true });

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
    });

    it('should handle empty CLI options', () => {
      const originalDocsHost = OPTIONS.docsHost;

      const freshOptions = freezeOptions({});

      // Verify it's a different object
      expect(freshOptions).not.toBe(OPTIONS);

      // Verify docsHost remains unchanged
      expect(freshOptions.docsHost).toBe(originalDocsHost);
      expect(OPTIONS.docsHost).toBe(originalDocsHost);
    });

    it('should handle partial CLI options', () => {
      const originalName = OPTIONS.name;

      const freshOptions = freezeOptions({ docsHost: true });

      // Verify it's a different object
      expect(freshOptions).not.toBe(OPTIONS);

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

      // Verify the returned instance is not frozen
      expect(Object.isFrozen(freshOptions)).toBe(false);
    });

    it('should allow modification of returned instance', () => {
      const freshOptions = freezeOptions({ docsHost: true });

      // Should be able to modify the returned instance
      freshOptions.docsHost = false;
      expect(freshOptions.docsHost).toBe(false);

      // OPTIONS should remain unchanged
      expect(OPTIONS.docsHost).toBe(true);
    });

    it('should maintain isolation between instances', () => {
      const firstOptions = freezeOptions({ docsHost: true });
      const secondOptions = freezeOptions({ docsHost: false });

      // Modify first instance
      firstOptions.docsHost = false;

      // Second instance should be unaffected
      expect(secondOptions.docsHost).toBe(false);
      expect(OPTIONS.docsHost).toBe(false);
    });
  });

  describe('multiple freezeOptions calls', () => {
    it('should handle multiple calls correctly', () => {
      const firstOptions = freezeOptions({ docsHost: true });

      expect(firstOptions.docsHost).toBe(true);
      expect(OPTIONS.docsHost).toBe(true);

      const secondOptions = freezeOptions({ docsHost: false });

      expect(secondOptions.docsHost).toBe(false);
      expect(OPTIONS.docsHost).toBe(false);

      const thirdOptions = freezeOptions({});

      expect(thirdOptions.docsHost).toBe(false);
      expect(OPTIONS.docsHost).toBe(false);
    });

    it('should create independent instances on each call', () => {
      const firstOptions = freezeOptions({ docsHost: true });
      const secondOptions = freezeOptions({ docsHost: false });
      const thirdOptions = freezeOptions({});

      // All should be different objects
      expect(firstOptions).not.toBe(secondOptions);
      expect(secondOptions).not.toBe(thirdOptions);
      expect(firstOptions).not.toBe(thirdOptions);

      // All should be different from OPTIONS
      expect(firstOptions).not.toBe(OPTIONS);
      expect(secondOptions).not.toBe(OPTIONS);
      expect(thirdOptions).not.toBe(OPTIONS);
    });
  });
});
