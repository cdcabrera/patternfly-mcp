import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import * as options from '../options';
import { parseCliOptions, freezeOptions, validateConfigPath, normalizePlugins, OPTIONS } from '../options';

describe('options', () => {
  it('should return specific properties', () => {
    expect(options).toMatchSnapshot();
  });
});

describe('parseCliOptions', () => {
  const originalArgv = process.argv;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
  });

  afterEach(() => {
    process.argv = originalArgv;
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  it.each([
    {
      description: 'with --docs-host flag',
      args: ['node', 'script.js', '--docs-host'],
      expected: { docsHost: true, config: undefined, plugins: undefined, validatedPlugins: [], verbose: undefined }
    },
    {
      description: 'without any flags',
      args: ['node', 'script.js'],
      expected: { docsHost: undefined, config: undefined, plugins: undefined, validatedPlugins: [], verbose: undefined }
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
      expected: {
        docsHost: undefined,
        config: undefined,
        plugins: ['@patternfly/mcp-tool-search'],
        validatedPlugins: ['@patternfly/mcp-tool-search'],
        verbose: undefined
      }
    },
    {
      description: 'with short -p plugins flag',
      args: ['node', 'script.js', '-p', '@patternfly/mcp-tool-search,@org/my-plugin'],
      expected: {
        docsHost: undefined,
        config: undefined,
        plugins: ['@patternfly/mcp-tool-search,@org/my-plugin'],
        validatedPlugins: ['@patternfly/mcp-tool-search', '@org/my-plugin'],
        verbose: undefined
      }
    },
    {
      description: 'with --verbose flag',
      args: ['node', 'script.js', '--verbose'],
      expected: { docsHost: undefined, config: undefined, plugins: undefined, validatedPlugins: [], verbose: true }
    },
    {
      description: 'with short -v verbose flag',
      args: ['node', 'script.js', '-v'],
      expected: { docsHost: undefined, config: undefined, plugins: undefined, validatedPlugins: [], verbose: true }
    },
    {
      description: 'with multiple flags',
      args: ['node', 'script.js', '--docs-host', '--verbose', '--plugins', '@patternfly/tool'],
      expected: {
        docsHost: true,
        config: undefined,
        plugins: ['@patternfly/tool'],
        validatedPlugins: ['@patternfly/tool'],
        verbose: true
      }
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

  it('should normalize all plugins (no format filtering)', () => {
    const args = ['node', 'script.js', '--plugins', '@valid/plugin,weird$name,@another/valid'];
    const result = parseCliOptions(args);

    expect(result.plugins).toEqual(['@valid/plugin,weird$name,@another/valid']);
    // All plugins accepted - validation happens at load time
    expect(result.validatedPlugins).toEqual(['@valid/plugin', 'weird$name', '@another/valid']);
  });

  it('should support multiple --plugins flags', () => {
    const args = ['node', 'script.js', '--plugins', '@patternfly/tool', '--plugins', './local-plugin'];
    const result = parseCliOptions(args);

    expect(result.plugins).toEqual(['@patternfly/tool', './local-plugin']);
    expect(result.validatedPlugins).toEqual(['@patternfly/tool', './local-plugin']);
  });

  it('should support mixing multiple flags and comma-separated values', () => {
    const args = [
      'node',
      'script.js',
      '--plugins',
      '@patternfly/tool-1,@patternfly/tool-2',
      '--plugins',
      './local-plugin',
      '--plugins',
      '@org/another'
    ];
    const result = parseCliOptions(args);

    expect(result.plugins).toEqual([
      '@patternfly/tool-1,@patternfly/tool-2',
      './local-plugin',
      '@org/another'
    ]);
    expect(result.validatedPlugins).toEqual([
      '@patternfly/tool-1',
      '@patternfly/tool-2',
      './local-plugin',
      '@org/another'
    ]);
  });

  it('should support short -p flag multiple times', () => {
    const args = ['node', 'script.js', '-p', '@patternfly/tool', '-p', './local'];
    const result = parseCliOptions(args);

    expect(result.plugins).toEqual(['@patternfly/tool', './local']);
    expect(result.validatedPlugins).toEqual(['@patternfly/tool', './local']);
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

describe('normalizePlugins', () => {
  // Suppress console output during tests
  let consoleWarnSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  it('should normalize single plugin', () => {
    const result = normalizePlugins('@patternfly/mcp-tool-search');

    expect(result).toEqual(['@patternfly/mcp-tool-search']);
  });

  it('should normalize multiple plugins', () => {
    const result = normalizePlugins('@patternfly/tool-1,@org/tool-2,simple-plugin');

    expect(result).toEqual(['@patternfly/tool-1', '@org/tool-2', 'simple-plugin']);
  });

  it('should accept any plugin name format (validation happens at load time)', () => {
    const result = normalizePlugins('@scope/plugin-name.test,weird$name,invalid plugin');

    // All accepted - actual validation happens when loading
    expect(result).toEqual(['@scope/plugin-name.test', 'weird$name', 'invalid plugin']);
  });

  it('should trim whitespace and filter empty strings', () => {
    const result = normalizePlugins('  @plugin/one  ,  , @plugin/two  ');

    expect(result).toEqual(['@plugin/one', '@plugin/two']);
  });

  it('should return empty array for empty plugin list and warn', () => {
    const result = normalizePlugins('   ,  ,  ');

    expect(result).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Plugin list is empty'));
  });

  it('should return empty array for empty string', () => {
    const result = normalizePlugins('');

    expect(result).toEqual([]);
  });

  it('should show verbose output when enabled', () => {
    const result = normalizePlugins('@plugin/one,@plugin/two', { verbose: true });

    expect(result).toEqual(['@plugin/one', '@plugin/two']);
    expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Normalized 2 plugin(s)'));
  });

  it('should handle array input (multiple --plugins flags)', () => {
    const result = normalizePlugins(['@patternfly/tool', './local-plugin']);

    expect(result).toEqual(['@patternfly/tool', './local-plugin']);
  });

  it('should handle array input with comma-separated values in elements', () => {
    const result = normalizePlugins(['@patternfly/tool-1,@patternfly/tool-2', './local']);

    expect(result).toEqual(['@patternfly/tool-1', '@patternfly/tool-2', './local']);
  });

  it('should handle mixed npm and local plugins', () => {
    const result = normalizePlugins(['@patternfly/tool', './local-plugin', '@org/another', '../other-plugin']);

    expect(result).toEqual(['@patternfly/tool', './local-plugin', '@org/another', '../other-plugin']);
  });

  it('should return empty array for empty array input', () => {
    const result = normalizePlugins([]);

    expect(result).toEqual([]);
  });

  it('should accept all path formats without filtering', () => {
    const result = normalizePlugins('./local,../parent,/absolute,~/home,C:\\windows');

    expect(result).toEqual(['./local', '../parent', '/absolute', '~/home', 'C:\\windows']);
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
