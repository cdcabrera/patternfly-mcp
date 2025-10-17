import { buildPluginContext } from '../plugin-context';
import { OPTIONS } from '../options';

describe('buildPluginContext', () => {
  it('should build context with required fields', () => {
    const context = buildPluginContext();

    expect(context).toHaveProperty('config');
    expect(context).toHaveProperty('utils');
    expect(context).toHaveProperty('logger');
    expect(context).toHaveProperty('types');
  });

  it('should include server info in config', () => {
    const context = buildPluginContext();

    expect(context.config).toHaveProperty('serverName');
    expect(context.config).toHaveProperty('serverVersion');
    expect(context.config).toHaveProperty('separator');
    expect(context.config.serverName).toBe(OPTIONS.name);
    expect(context.config.serverVersion).toBe(OPTIONS.version);
    expect(context.config.separator).toBe(OPTIONS.separator);
  });

  it('should merge provided config', () => {
    const customConfig = {
      pluginOptions: { custom: true },
      otherValue: 'test'
    };
    const context = buildPluginContext(customConfig);

    expect(context.config).toMatchObject(customConfig);
    expect(context.config.serverName).toBe(OPTIONS.name);
  });

  it('should freeze config to prevent modifications', () => {
    const context = buildPluginContext();

    expect(Object.isFrozen(context.config)).toBe(true);

    // Attempt to modify should throw in strict mode (TypeScript default)
    expect(() => {
      (context.config as Record<string, unknown>).serverName = 'modified';
    }).toThrow();

    // Value should remain unchanged
    expect(context.config.serverName).toBe(OPTIONS.name);
  });

  it('should provide memo utility', () => {
    const context = buildPluginContext();

    expect(context.utils).toHaveProperty('memo');
    expect(typeof context.utils.memo).toBe('function');
  });

  it('should provide fetchUrl utility', () => {
    const context = buildPluginContext();

    expect(context.utils).toHaveProperty('fetchUrl');
    expect(typeof context.utils.fetchUrl).toBe('function');
  });

  it('should provide readFile utility', () => {
    const context = buildPluginContext();

    expect(context.utils).toHaveProperty('readFile');
    expect(typeof context.utils.readFile).toBe('function');
  });

  it('should provide resolveLocalPath utility', () => {
    const context = buildPluginContext();

    expect(context.utils).toHaveProperty('resolveLocalPath');
    expect(typeof context.utils.resolveLocalPath).toBe('function');
  });

  it('should resolve absolute paths as-is', () => {
    const context = buildPluginContext();
    const absolutePath = '/absolute/path/file.txt';

    expect(context.utils.resolveLocalPath(absolutePath)).toBe(absolutePath);
  });

  it('should resolve Windows absolute paths as-is', () => {
    const context = buildPluginContext();
    const windowsPath = 'C:\\absolute\\path\\file.txt';

    expect(context.utils.resolveLocalPath(windowsPath)).toBe(windowsPath);
  });

  it('should resolve relative paths based on context', () => {
    const context = buildPluginContext();
    const relativePath = './relative/path.txt';
    const resolved = context.utils.resolveLocalPath(relativePath);

    expect(resolved).toContain('relative/path.txt');
    expect(resolved).not.toBe(relativePath);
  });

  it('should provide logger functions', () => {
    const context = buildPluginContext();

    expect(context.logger).toHaveProperty('info');
    expect(context.logger).toHaveProperty('warn');
    expect(context.logger).toHaveProperty('error');
    expect(context.logger).toHaveProperty('debug');
    expect(typeof context.logger.info).toBe('function');
    expect(typeof context.logger.warn).toBe('function');
    expect(typeof context.logger.error).toBe('function');
    expect(typeof context.logger.debug).toBe('function');
  });

  it('should provide MCP types', () => {
    const context = buildPluginContext();

    expect(context.types).toHaveProperty('McpError');
    expect(context.types).toHaveProperty('ErrorCode');
    expect(typeof context.types.McpError).toBe('function');
    expect(typeof context.types.ErrorCode).toBe('object');
  });

  it('should use custom options if provided', () => {
    const customOptions = {
      ...OPTIONS,
      name: 'custom-server',
      version: '2.0.0',
      separator: '\n~~~\n'
    };
    const context = buildPluginContext({}, customOptions);

    expect(context.config.serverName).toBe('custom-server');
    expect(context.config.serverVersion).toBe('2.0.0');
    expect(context.config.separator).toBe('\n~~~\n');
  });
});

