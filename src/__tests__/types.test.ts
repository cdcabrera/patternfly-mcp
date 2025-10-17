/**
 * Tests for public type exports
 * Ensures plugin authors can import types correctly
 */

// Import all types from main entry point
import type {
  // Server types
  McpTool,
  McpToolCreator,
  // CLI types
  CliOptions,
  // Memo types
  MemoOptions,
  // Plugin types
  PluginContext,
  PluginFactory,
  PluginMetadata,
  PluginModule,
  PluginConfig,
  ServerConfig
} from '../types';

describe('Type Exports', () => {
  it('should export McpTool type', () => {
    const tool: McpTool = [
      'testTool',
      { description: 'test', inputSchema: {} },
      async () => ({ content: [] })
    ];

    expect(tool).toBeDefined();
    expect(tool[0]).toBe('testTool');
  });

  it('should export McpToolCreator type', () => {
    const creator: McpToolCreator = () => [
      'testTool',
      { description: 'test', inputSchema: {} },
      async () => ({ content: [] })
    ];

    expect(creator).toBeDefined();
    expect(typeof creator).toBe('function');
  });

  it('should export CliOptions type', () => {
    const options: CliOptions = {
      docsHost: true
    };

    expect(options).toBeDefined();
    expect(options.docsHost).toBe(true);
  });

  it('should export MemoOptions type', () => {
    const options: MemoOptions = {
      cacheLimit: 50,
      expire: 5000,
      cacheErrors: false
    };

    expect(options).toBeDefined();
    expect(options.cacheLimit).toBe(50);
  });

  it('should export PluginMetadata type', () => {
    const metadata: PluginMetadata = {
      name: '@test/plugin',
      version: '1.0.0',
      description: 'Test plugin'
    };

    expect(metadata).toBeDefined();
    expect(metadata.name).toBe('@test/plugin');
  });

  it('should export PluginConfig type', () => {
    const config: PluginConfig = {
      package: '@test/plugin',
      enabled: true,
      options: { key: 'value' }
    };

    expect(config).toBeDefined();
    expect(config.package).toBe('@test/plugin');
  });

  it('should export ServerConfig type', () => {
    const config: ServerConfig = {
      server: {
        name: 'test-server',
        version: '1.0.0'
      },
      plugins: [
        {
          package: '@test/plugin',
          enabled: true
        }
      ]
    };

    expect(config).toBeDefined();
    expect(config.server?.name).toBe('test-server');
  });

  it('should export PluginContext type structure', () => {
    // This is just a type check - we're not testing functionality
    const mockContext: Partial<PluginContext> = {
      config: {
        serverName: 'test',
        serverVersion: '1.0.0',
        separator: '\n\n---\n\n'
      }
    };

    expect(mockContext.config).toBeDefined();
    expect(mockContext.config?.serverName).toBe('test');
  });

  it('should export PluginFactory type signature', () => {
    // Type-only test: ensures PluginFactory signature is correct
    const factory: PluginFactory = _context => () => [
      'testTool',
      { description: 'test', inputSchema: {} },
      async () => ({ content: [] })
    ];

    expect(factory).toBeDefined();
    expect(typeof factory).toBe('function');
  });

  it('should export PluginModule type structure', () => {
    const mockModule: PluginModule = {
      default: _context => () => [
        'testTool',
        { description: 'test', inputSchema: {} },
        async () => ({ content: [] })
      ],
      metadata: {
        name: '@test/plugin',
        version: '1.0.0'
      }
    };

    expect(mockModule.default).toBeDefined();
    expect(mockModule.metadata?.name).toBe('@test/plugin');
  });
});

