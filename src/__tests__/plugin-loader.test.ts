import { isLocalPath } from '../plugin-loader';

describe('plugin-loader', () => {
  describe('isLocalPath', () => {
    it('should identify relative paths starting with ./', () => {
      expect(isLocalPath('./plugin.js')).toBe(true);
      expect(isLocalPath('./dir/plugin.js')).toBe(true);
    });

    it('should identify relative paths starting with ../', () => {
      expect(isLocalPath('../plugin.js')).toBe(true);
      expect(isLocalPath('../dir/plugin.js')).toBe(true);
    });

    it('should identify absolute Unix paths', () => {
      expect(isLocalPath('/absolute/path/plugin.js')).toBe(true);
      expect(isLocalPath('/usr/local/lib/plugin.js')).toBe(true);
    });

    it('should identify home directory paths', () => {
      expect(isLocalPath('~/plugin.js')).toBe(true);
      expect(isLocalPath('~/dir/plugin.js')).toBe(true);
    });

    it('should identify Windows absolute paths', () => {
      expect(isLocalPath('C:\\plugin.js')).toBe(true);
      expect(isLocalPath('D:\\dir\\plugin.js')).toBe(true);
      expect(isLocalPath('c:\\plugin.js')).toBe(true); // Lowercase
    });

    it('should identify npm package names', () => {
      expect(isLocalPath('@patternfly/plugin')).toBe(false);
      expect(isLocalPath('my-plugin')).toBe(false);
      expect(isLocalPath('@scope/package-name')).toBe(false);
    });
  });
});

// Note: Full plugin loading tests (including dynamic imports) are tested in E2E tests
// due to complexity of ESM imports in Jest environment

