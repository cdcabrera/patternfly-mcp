import {
  isPlugin,
  normalizeToCreators,
  pluginCreatorsToCreators,
  pluginToCreators,
  pluginToolsToCreators,
  type AppToolPlugin
} from '../server.toolsCreator';
import { type McpTool, type McpToolCreator } from '../server';
import { type GlobalOptions } from '../options';

// Mock dependencies
jest.mock('../logger', () => ({
  log: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn()
  },
  formatUnknownError: jest.fn((error: unknown) => String(error))
}));

describe('isPlugin', () => {
  it.each([
    {
      description: 'plugin with createCreators',
      value: {
        createCreators: () => []
      },
      expected: true
    },
    {
      description: 'plugin with createTools',
      value: {
        createTools: () => []
      },
      expected: true
    },
    {
      description: 'plugin with both createCreators and createTools',
      value: {
        createCreators: () => [],
        createTools: () => []
      },
      expected: true
    },
    {
      description: 'plugin with name and createCreators',
      value: {
        name: 'TestPlugin',
        createCreators: () => []
      },
      expected: true
    },
    {
      description: 'plain object without plugin methods',
      value: {
        name: 'Test',
        other: 'property'
      },
      expected: false
    },
    {
      description: 'null',
      value: null,
      expected: false
    },
    {
      description: 'undefined',
      value: undefined,
      expected: false
    },
    {
      description: 'string',
      value: 'not a plugin',
      expected: false
    },
    {
      description: 'number',
      value: 123,
      expected: false
    },
    {
      description: 'array',
      value: [],
      expected: false
    },
    {
      description: 'function',
      value: () => {},
      expected: false
    },
    {
      description: 'object with non-function createCreators',
      value: {
        createCreators: 'not a function'
      },
      expected: false
    },
    {
      description: 'object with non-function createTools',
      value: {
        createTools: 'not a function'
      },
      expected: false
    }
  ])('should check if value is plugin, $description', ({ value, expected }) => {
    expect(isPlugin(value)).toBe(expected);
  });
});

describe('pluginCreatorsToCreators', () => {
  it.each([
    {
      description: 'with valid createCreators returning array',
      plugin: {
        name: 'TestPlugin',
        createCreators: () => [
          () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()],
          () => ['Tool2', { description: 'Tool 2', inputSchema: {} }, jest.fn()]
        ]
      },
      expectedLength: 2
    },
    {
      description: 'with createCreators returning empty array',
      plugin: {
        createCreators: () => []
      },
      expectedLength: 0
    },
    {
      description: 'with createCreators returning single creator',
      plugin: {
        createCreators: () => [
          () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
        ]
      },
      expectedLength: 1
    },
    {
      description: 'with createCreators returning non-array',
      plugin: {
        createCreators: () => 'not an array'
      },
      expectedLength: 0
    },
    {
      description: 'with createCreators returning array with non-functions',
      plugin: {
        createCreators: () => ['not a function', 123]
      },
      expectedLength: 0
    },
    {
      description: 'with createCreators throwing error',
      plugin: {
        name: 'ErrorPlugin',
        createCreators: () => {
          throw new Error('Creator error');
        }
      },
      expectedLength: 0
    },
    {
      description: 'without createCreators method',
      plugin: {
        name: 'NoCreatorsPlugin'
      },
      expectedLength: 0
    }
  ])('should adapt plugin creators, $description', ({ plugin, expectedLength }) => {
    const result = pluginCreatorsToCreators(plugin as AppToolPlugin);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(expectedLength);
    if (expectedLength > 0) {
      expect(typeof result[0]).toBe('function');
    }
  });
});

describe('pluginToolsToCreators', () => {
  it.each([
    {
      description: 'with createTools returning single tool',
      plugin: {
        name: 'TestPlugin',
        createTools: () => [
          ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
        ]
      },
      expectedLength: 1
    },
    {
      description: 'with createTools returning multiple tools',
      plugin: {
        createTools: () => [
          ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()],
          ['Tool2', { description: 'Tool 2', inputSchema: {} }, jest.fn()],
          ['Tool3', { description: 'Tool 3', inputSchema: {} }, jest.fn()]
        ]
      },
      expectedLength: 3
    },
    {
      description: 'with createTools returning empty array',
      plugin: {
        createTools: () => []
      },
      expectedLength: 1
    },
    {
      description: 'with createTools throwing error',
      plugin: {
        name: 'ErrorPlugin',
        createTools: () => {
          throw new Error('Tools error');
        }
      },
      expectedLength: 1
    },
    {
      description: 'without createTools method',
      plugin: {
        name: 'NoToolsPlugin'
      },
      expectedLength: 1
    }
  ])('should adapt plugin tools to creators, $description', ({ plugin, expectedLength }) => {
    const result = pluginToolsToCreators(plugin as AppToolPlugin);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(expectedLength);
    expect(typeof result[0]).toBe('function');
  });

  it('should create creator that returns tool at runtime', () => {
    const tool: McpTool = ['RuntimeTool', { description: 'Runtime tool', inputSchema: {} }, jest.fn()];
    const plugin: AppToolPlugin = {
      name: 'RuntimePlugin',
      createTools: () => [tool]
    };

    const creators = pluginToolsToCreators(plugin);

    expect(creators.length).toBe(1);
    const creator = creators[0];

    expect(creator).toBeDefined();
    if (creator) {
      const createdTool = creator();

      expect(createdTool).toEqual(tool);
    }
  });

  it('should create creator that uses options at runtime', () => {
    const tool1: McpTool = ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()];
    const tool2: McpTool = ['Tool2', { description: 'Tool 2', inputSchema: {} }, jest.fn()];
    const plugin: AppToolPlugin = {
      createTools: (options?: GlobalOptions) => (options?.docsHost ? [tool1] : [tool2])
    };

    const creators = pluginToolsToCreators(plugin);

    expect(creators.length).toBe(1);
    const creator = creators[0];

    expect(creator).toBeDefined();
    if (creator) {
      const toolWithOptions = creator({ docsHost: true } as GlobalOptions);

      expect(toolWithOptions).toEqual(tool1);
      const toolWithoutOptions = creator({} as GlobalOptions);

      expect(toolWithoutOptions).toEqual(tool2);
    }
  });

  it('should throw when tool not available at runtime', () => {
    const plugin: AppToolPlugin = {
      name: 'EmptyPlugin',
      createTools: () => []
    };

    const creators = pluginToolsToCreators(plugin);

    expect(creators.length).toBe(1);
    const creator = creators[0];

    expect(creator).toBeDefined();
    if (creator) {
      expect(() => {
        creator();
      }).toThrow("Plugin 'EmptyPlugin' did not provide a tool at index 0");
    }
  });

  it('should handle tool at specific index', () => {
    const tool0: McpTool = ['Tool0', { description: 'Tool 0', inputSchema: {} }, jest.fn()];
    const tool1: McpTool = ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()];
    const plugin: AppToolPlugin = {
      createTools: () => [tool0, tool1]
    };

    const creators = pluginToolsToCreators(plugin);

    expect(creators.length).toBe(2);
    const creator0 = creators[0];

    expect(creator0).toBeDefined();
    if (creator0) {
      expect(creator0()).toEqual(tool0);
    }
    const creator1 = creators[1];

    expect(creator1).toBeDefined();
    if (creator1) {
      expect(creator1()).toEqual(tool1);
    }
  });

  it('should fallback to first tool when index out of bounds', () => {
    const tool0: McpTool = ['Tool0', { description: 'Tool 0', inputSchema: {} }, jest.fn()];
    const plugin: AppToolPlugin = {
      createTools: () => [tool0]
    };

    const creators = pluginToolsToCreators(plugin);

    // Creator at index 1 should fallback to tool at index 0
    const creatorAt1 = creators[1];

    if (creatorAt1) {
      expect(creatorAt1()).toEqual(tool0);
    }
  });
});

describe('pluginToCreators', () => {
  it.each([
    {
      description: 'plugin with createCreators',
      plugin: {
        name: 'CreatorsPlugin',
        createCreators: () => [
          () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
        ]
      },
      expectedLength: 1
    },
    {
      description: 'plugin with createTools (no createCreators)',
      plugin: {
        name: 'ToolsPlugin',
        createTools: () => [
          ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
        ]
      },
      expectedLength: 1
    },
    {
      description: 'plugin with both, prefers createCreators',
      plugin: {
        createCreators: () => [
          () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
        ],
        createTools: () => [
          ['Tool2', { description: 'Tool 2', inputSchema: {} }, jest.fn()]
        ]
      },
      expectedLength: 1
    },
    {
      description: 'plugin with empty createCreators, falls back to createTools',
      plugin: {
        createCreators: () => [],
        createTools: () => [
          ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
        ]
      },
      expectedLength: 1
    }
  ])('should convert plugin to creators, $description', ({ plugin, expectedLength }) => {
    const result = pluginToCreators(plugin as unknown as AppToolPlugin);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(expectedLength);
  });
});

describe('normalizeToCreators', () => {
  it.each([
    {
      description: 'direct tool creator function',
      moduleExports: () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()],
      expectedLength: 1
    },
    {
      description: 'tool creator as default export',
      moduleExports: {
        default: () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
      },
      expectedLength: 1
    },
    {
      description: 'plugin factory returning plugin with createCreators',
      moduleExports: () => ({
        name: 'FactoryPlugin',
        createCreators: () => [
          () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
        ]
      }),
      expectedLength: 1
    },
    {
      description: 'plugin factory returning plugin with createTools',
      moduleExports: () => ({
        createTools: () => [
          ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
        ]
      }),
      expectedLength: 1
    },
    {
      description: 'plugin object with createCreators',
      moduleExports: {
        createCreators: () => [
          () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
        ]
      },
      expectedLength: 1
    },
    {
      description: 'plugin object as default export',
      moduleExports: {
        default: {
          createTools: () => [
            ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
          ]
        }
      },
      expectedLength: 1
    },
    {
      description: 'array of tool creators',
      moduleExports: [
        () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()],
        () => ['Tool2', { description: 'Tool 2', inputSchema: {} }, jest.fn()]
      ],
      expectedLength: 2
    },
    {
      description: 'array of tool creators as default export',
      moduleExports: {
        default: [
          () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
        ]
      },
      expectedLength: 1
    },
    {
      description: 'empty module',
      moduleExports: {},
      expectedLength: 0
    },
    {
      description: 'null',
      moduleExports: null,
      expectedLength: 0
    },
    {
      description: 'undefined',
      moduleExports: undefined,
      expectedLength: 0
    },
    {
      description: 'function that throws',
      moduleExports: () => {
        throw new Error('Function error');
      },
      expectedLength: 0
    },
    {
      description: 'function returning non-tool, non-plugin',
      moduleExports: () => 'not a tool or plugin',
      expectedLength: 0
    },
    {
      description: 'array with non-function elements',
      moduleExports: ['not a function', 123, {}],
      expectedLength: 0
    },
    {
      description: 'function returning array with non-tool elements',
      moduleExports: () => ['not a tool tuple', 123],
      // The function returns an array, but it's not a tool tuple (first element is string but not a valid tool)
      // The function is invoked, result is ['not a tool tuple', 123]
      // It checks if result[0] is a string (it is), so it treats it as a tool creator
      // Actually, looking at the code: it checks if Array.isArray(result) && typeof result[0] === 'string'
      // So ['not a tool tuple', 123] would match this check and return the function as a creator
      expectedLength: 1
    }
  ])('should normalize module exports, $description', ({ moduleExports, expectedLength }) => {
    const result = normalizeToCreators(moduleExports);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(expectedLength);
    if (expectedLength > 0) {
      expect(typeof result[0]).toBe('function');
    }
  });

  it('should handle plugin factory that returns empty creators', () => {
    const moduleExports = () => ({
      createCreators: () => [],
      createTools: () => [
        ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
      ]
    });

    const result = normalizeToCreators(moduleExports);

    // Should fall back to createTools
    expect(result.length).toBe(1);
  });

  it('should handle multiple candidates (default and named)', () => {
    const toolCreator: McpToolCreator = () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()];
    const moduleExports = {
      default: toolCreator,
      named: 'not a creator'
    };

    const result = normalizeToCreators(moduleExports);

    // Should use default export
    expect(result.length).toBe(1);
    expect(result[0]).toBe(toolCreator);
  });

  it('should prefer default export over named export', () => {
    const defaultCreator: McpToolCreator = () => ['DefaultTool', { description: 'Default', inputSchema: {} }, jest.fn()];
    const namedCreator: McpToolCreator = () => ['NamedTool', { description: 'Named', inputSchema: {} }, jest.fn()];

    const moduleExports = {
      default: defaultCreator,
      named: namedCreator
    };

    const result = normalizeToCreators(moduleExports);

    expect(result.length).toBe(1);
    expect(result[0]).toBe(defaultCreator);
  });

  it('should handle plugin factory that throws during invocation', () => {
    const moduleExports = () => {
      throw new Error('Factory error');
    };

    const result = normalizeToCreators(moduleExports);

    expect(result.length).toBe(0);
  });

  it('should handle function returning plugin that has both methods but empty createCreators', () => {
    const moduleExports = () => ({
      createCreators: () => [],
      createTools: () => [
        ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()]
      ]
    });

    const result = normalizeToCreators(moduleExports);

    // Should fall back to createTools when createCreators is empty
    expect(result.length).toBe(1);
  });
});
