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

  it('should filter invalid plugins and continue', () => {
    const args = ['node', 'script.js', '--plugins', '@valid/plugin,invalid plugin,@another/valid'];
    const result = parseCliOptions(args);

    expect(result.plugins).toEqual(['@valid/plugin,invalid plugin,@another/valid']);
    expect(result.validatedPlugins).toEqual(['@valid/plugin', '@another/valid']);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid plugin format, skipping: invalid plugin')
    );
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

describe('validatePlugins', () => {
  // Suppress console output during tests
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  it('should return valid plugins for valid single plugin', () => {
    const result = validatePlugins('@patternfly/mcp-tool-search');

    expect(result).toEqual(['@patternfly/mcp-tool-search']);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return valid plugins for valid multiple plugins', () => {
    const result = validatePlugins('@patternfly/tool-1,@org/tool-2,simple-plugin');

    expect(result).toEqual(['@patternfly/tool-1', '@org/tool-2', 'simple-plugin']);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should return valid plugins for plugin with dashes and dots', () => {
    const result = validatePlugins('@scope/plugin-name.test');

    expect(result).toEqual(['@scope/plugin-name.test']);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should skip invalid plugin name (spaces) and log error', () => {
    const result = validatePlugins('invalid plugin');

    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid plugin format, skipping: invalid plugin')
    );
  });

  it('should skip invalid plugin name (special chars) and log error', () => {
    const result = validatePlugins('@scope/plugin$name');

    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid plugin format, skipping: @scope/plugin$name')
    );
  });

  it('should return empty array for empty plugin list and warn', () => {
    const result = validatePlugins('   ,  ,  ');

    expect(result).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Plugin list is empty'));
  });

  it('should return empty array for empty string', () => {
    const result = validatePlugins('');

    expect(result).toEqual([]);
  });

  it('should filter out invalid and return valid plugins', () => {
    const result = validatePlugins('@valid/plugin,invalid plugin,@another/valid');

    expect(result).toEqual(['@valid/plugin', '@another/valid']);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid plugin format, skipping: invalid plugin')
    );
  });

  it('should show verbose output when enabled', () => {
    const result = validatePlugins('@valid/plugin', { verbose: true });

    expect(result).toEqual(['@valid/plugin']);
    expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('Valid plugin'));
    expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('@valid/plugin'));
  });

  it('should show detailed error in verbose mode', () => {
    const result = validatePlugins('invalid$plugin', { verbose: true });

    expect(result).toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid plugin format'));
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Valid formats:'));
  });

  it('should accept relative local paths (./)', () => {
    const result = validatePlugins('./my-plugin.js');

    expect(result).toEqual(['./my-plugin.js']);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should accept relative local paths (../)', () => {
    const result = validatePlugins('../plugins/custom-tool');

    expect(result).toEqual(['../plugins/custom-tool']);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should accept absolute Unix paths', () => {
    const result = validatePlugins('/absolute/path/to/plugin');

    expect(result).toEqual(['/absolute/path/to/plugin']);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should accept home directory paths', () => {
    const result = validatePlugins('~/plugins/my-tool');

    expect(result).toEqual(['~/plugins/my-tool']);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should accept Windows absolute paths', () => {
    const result = validatePlugins('C:\\Users\\dev\\plugins\\tool.js');

    expect(result).toEqual(['C:\\Users\\dev\\plugins\\tool.js']);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should accept mixed npm and local plugins', () => {
    const result = validatePlugins('@patternfly/tool,./local-plugin,@org/another,../other-plugin');

    expect(result).toEqual(['@patternfly/tool', './local-plugin', '@org/another', '../other-plugin']);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should show plugin type in verbose mode for local path', () => {
    const result = validatePlugins('./my-plugin', { verbose: true });

    expect(result).toEqual(['./my-plugin']);
    expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('local path'));
  });

  it('should show plugin type in verbose mode for npm package', () => {
    const result = validatePlugins('@patternfly/tool', { verbose: true });

    expect(result).toEqual(['@patternfly/tool']);
    expect(consoleInfoSpy).toHaveBeenCalledWith(expect.stringContaining('npm package'));
  });

  it('should handle array input (multiple --plugins flags)', () => {
    const result = validatePlugins(['@patternfly/tool', './local-plugin']);

    expect(result).toEqual(['@patternfly/tool', './local-plugin']);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should handle array input with comma-separated values in elements', () => {
    const result = validatePlugins(['@patternfly/tool-1,@patternfly/tool-2', './local']);

    expect(result).toEqual(['@patternfly/tool-1', '@patternfly/tool-2', './local']);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should filter invalid plugins from array input', () => {
    const result = validatePlugins(['@valid/plugin', 'invalid plugin', './local']);

    expect(result).toEqual(['@valid/plugin', './local']);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid plugin format, skipping: invalid plugin')
    );
  });

  it('should return empty array for empty array input', () => {
    const result = validatePlugins([]);

    expect(result).toEqual([]);
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
