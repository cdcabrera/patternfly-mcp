import { resolveExternalCreators } from '../server.toolsHostCreator';
import { type McpToolCreator } from '../server';

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

// plugin-object support removed in streamlined implementation

// plugin-object adapters removed; tests eliminated

describe('resolveExternalCreators (streamlined)', () => {
  it.each([
    {
      description: 'function export returning a realized tuple (cached)',
      moduleExports: { default: () => ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()] },
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
      description: 'function returning unsupported shape',
      moduleExports: () => 'not a tool or creators[]',
      expectedLength: 0
    },
    {
      description: 'array with non-function elements',
      moduleExports: ['not a function', 123, {}],
      expectedLength: 0
    },
    {
      description: 'function returning non-tuple array (should not pass)',
      moduleExports: () => ['not a tool tuple', 123],
      expectedLength: 0
    }
  ])('should normalize module exports, $description', ({ moduleExports, expectedLength }) => {
    const result = resolveExternalCreators(moduleExports);

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(expectedLength);
    if (expectedLength > 0) {
      expect(typeof result[0]).toBe('function');
    }
  });

  it('should handle multiple candidates (default and named)', () => {
    const defaultTuple = ['Tool1', { description: 'Tool 1', inputSchema: {} }, jest.fn()] as const;
    const moduleExports = {
      default: () => defaultTuple,
      named: 'not a creator'
    } as any;

    const result = resolveExternalCreators(moduleExports);

    // Should use default export and wrap cached tuple
    expect(result.length).toBe(1);
    expect(typeof result[0]).toBe('function');
    expect((result[0] as any).toolName).toBe('Tool1');
    expect(result[0]!()).toBe(defaultTuple);
  });

  it('should prefer default export over named export', () => {
    const defaultTuple = ['DefaultTool', { description: 'Default', inputSchema: {} }, jest.fn()] as const;
    const namedCreator: McpToolCreator = () => ['NamedTool', { description: 'Named', inputSchema: {} }, jest.fn()];

    const moduleExports = {
      default: () => defaultTuple,
      named: namedCreator
    } as any;

    const result = resolveExternalCreators(moduleExports);

    expect(result.length).toBe(1);
    expect(typeof result[0]).toBe('function');
    expect(result[0]!()).toBe(defaultTuple);
  });

  it('should handle function export that throws during invocation', () => {
    const moduleExports = () => {
      throw new Error('Factory error');
    };

    const result = resolveExternalCreators(moduleExports);

    expect(result.length).toBe(0);
  });
});
