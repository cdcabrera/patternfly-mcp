import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import * as options from '../options';
import { parseCliOptions, freezeOptions, validateConfigPath, validatePlugins, OPTIONS } from '../options';

describe('options', () => {
  it('should return specific properties', () => {
    expect(options).toMatchSnapshot();
  });
});

describe('parseCliOptions', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it.each([
    {
      description: 'with --docs-host flag',
      args: ['node', 'script.js', '--docs-host'],
      expected: { docsHost: true, config: undefined, plugins: undefined, verbose: undefined }
    },
    {
      description: 'without any flags',
      args: ['node', 'script.js'],
      expected: { docsHost: undefined, config: undefined, plugins: undefined, verbose: undefined }
    },
    {
      description: 'with --config flag',
      args: ['node', 'script.js', '--config', '/path/to/config.json'],
      shouldThrow: true // Will throw because file doesn't exist
    },
    {
      description: 'with short -c config flag',
      args: ['node', 'script.js', '-c', '/path/to/config.json'],
      shouldThrow: true // Will throw because file doesn't exist
    },
    {
      description: 'with --plugins flag',
      args: ['node', 'script.js', '--plugins', '@patternfly/mcp-tool-search'],
      expected: { docsHost: undefined, config: undefined, plugins: '@patternfly/mcp-tool-search', verbose: undefined }
    },
    {
      description: 'with short -p plugins flag',
      args: ['node', 'script.js', '-p', '@patternfly/mcp-tool-search,@org/my-plugin'],
      expected: { docsHost: undefined, config: undefined, plugins: '@patternfly/mcp-tool-search,@org/my-plugin', verbose: undefined }
    },
    {
      description: 'with --verbose flag',
      args: ['node', 'script.js', '--verbose'],
      expected: { docsHost: undefined, config: undefined, plugins: undefined, verbose: true }
    },
    {
      description: 'with short -v verbose flag',
      args: ['node', 'script.js', '-v'],
      expected: { docsHost: undefined, config: undefined, plugins: undefined, verbose: true }
    },
    {
      description: 'with multiple flags',
      args: ['node', 'script.js', '--docs-host', '--verbose', '--plugins', '@patternfly/tool'],
      expected: { docsHost: true, config: undefined, plugins: '@patternfly/tool', verbose: true }
    }
  ])('should parse CLI arguments: $description', ({ args, expected, shouldThrow }) => {
    if (shouldThrow) {
      expect(() => parseCliOptions(args)).toThrow();
    } else {
      const result = parseCliOptions(args);

      expect(result).toEqual(expected);
    }
  });

  it('should reject unknown options', () => {
    const args = ['node', 'script.js', '--unknown-option'];

    expect(() => parseCliOptions(args)).toThrow();
  });
});

describe('validateConfigPath', () => {
  const testDir = join(process.cwd(), '.test-configs');
  const validConfig = join(testDir, 'valid.json');
  const invalidJsonConfig = join(testDir, 'invalid.json');
  const nonJsonConfig = join(testDir, 'config.txt');

  beforeAll(() => {
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }
    writeFileSync(validConfig, JSON.stringify({ server: { name: 'test' } }));
    writeFileSync(invalidJsonConfig, '{ invalid json }');
    writeFileSync(nonJsonConfig, 'not json');
  });

  afterAll(() => {
    try {
      unlinkSync(validConfig);
      unlinkSync(invalidJsonConfig);
      unlinkSync(nonJsonConfig);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('should pass for valid config file', () => {
    expect(() => validateConfigPath(validConfig)).not.toThrow();
  });

  it('should throw for non-existent file', () => {
    expect(() => validateConfigPath('/nonexistent/config.json')).toThrow('Config file not found');
  });

  it('should throw for non-JSON file', () => {
    expect(() => validateConfigPath(nonJsonConfig)).toThrow('Config file must be a JSON file');
  });

  it('should throw for invalid JSON content', () => {
    expect(() => validateConfigPath(invalidJsonConfig)).toThrow('Invalid config file');
  });

  it('should not throw for empty string', () => {
    expect(() => validateConfigPath('')).not.toThrow();
  });
});

describe('validatePlugins', () => {
  it('should pass for valid single plugin', () => {
    expect(() => validatePlugins('@patternfly/mcp-tool-search')).not.toThrow();
  });

  it('should pass for valid multiple plugins', () => {
    expect(() => validatePlugins('@patternfly/tool-1,@org/tool-2,simple-plugin')).not.toThrow();
  });

  it('should pass for plugin with dashes and dots', () => {
    expect(() => validatePlugins('@scope/plugin-name.test')).not.toThrow();
  });

  it('should throw for invalid plugin name (spaces)', () => {
    expect(() => validatePlugins('invalid plugin')).toThrow('Invalid plugin name format');
  });

  it('should throw for invalid plugin name (special chars)', () => {
    expect(() => validatePlugins('@scope/plugin$name')).toThrow('Invalid plugin name format');
  });

  it('should throw for empty plugin list', () => {
    expect(() => validatePlugins('   ,  ,  ')).toThrow('Plugin list is empty');
  });

  it('should not throw for empty string', () => {
    expect(() => validatePlugins('')).not.toThrow();
  });

  it('should throw for one invalid in a list', () => {
    expect(() => validatePlugins('@valid/plugin,invalid plugin,@another/valid')).toThrow('Invalid plugin name format');
  });
});

describe('freezeOptions', () => {
  it('should return frozen options with consistent properties', () => {
    const result = freezeOptions({ docsHost: true });

    expect(Object.isFrozen(result)).toBe(true);
    expect(result).toBe(OPTIONS);
    expect(result).toMatchSnapshot('frozen');
  });
});
