import {
  requestHello,
  requestLoad,
  requestManifestGet,
  requestInvoke,
  requestShutdown,
  requestFallback,
  setHandlers
} from '../server.toolsHost';
import { type IpcRequest, type ToolDescriptor } from '../server.toolsIpc';
import { type McpTool } from '../server';
import { DEFAULT_OPTIONS } from '../options.defaults';

// Mock dependencies
jest.mock('../server.toolsCreator', () => ({
  normalizeToCreators: jest.fn((mod: any) => {
    // Default mock: return a simple creator function
    if (mod && typeof mod.default === 'function') {
      return [mod.default];
    }
    if (mod && typeof mod === 'function') {
      return [mod];
    }
    if (mod && Array.isArray(mod)) {
      return mod;
    }

    return [];
  })
}));

jest.mock('../server.toolsIpc', () => {
  const actual = jest.requireActual('../server.toolsIpc');

  return {
    ...actual,
    makeId: jest.fn(() => 'mock-tool-id')
  };
});

// Helper function to create host state for testing
const createTestHostState = (invokeTimeoutMs = DEFAULT_OPTIONS.pluginHost.invokeTimeoutMs) => {
  const toolMap = new Map<string, McpTool>();
  const descriptors: ToolDescriptor[] = [];

  return {
    toolMap,
    descriptors,
    invokeTimeoutMs
  };
};

describe('requestHello', () => {
  let mockSend: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();
    process.send = mockSend;
  });

  afterEach(() => {
    delete (process as any).send;
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with valid request',
      request: { t: 'hello' as const, id: 'test-id-1' }
    },
    {
      description: 'with different id',
      request: { t: 'hello' as const, id: 'test-id-2' }
    }
  ])('should send hello:ack message, $description', ({ request }) => {
    requestHello(request);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      t: 'hello:ack',
      id: request.id
    });
  });

  it('should not throw when process.send is undefined', () => {
    delete (process as any).send;

    expect(() => {
      requestHello({ t: 'hello', id: 'test-id' });
    }).not.toThrow();
  });
});

describe('requestLoad', () => {
  let mockSend: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();
    process.send = mockSend;
  });

  afterEach(() => {
    delete (process as any).send;
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with warnings and errors',
      request: { t: 'load' as const, id: 'test-id', specs: [] },
      warnings: ['warning1', 'warning2'],
      errors: ['error1']
    },
    {
      description: 'with empty warnings and errors',
      request: { t: 'load' as const, id: 'test-id', specs: [] },
      warnings: [],
      errors: []
    },
    {
      description: 'with only warnings',
      request: { t: 'load' as const, id: 'test-id', specs: [] },
      warnings: ['warning1'],
      errors: []
    },
    {
      description: 'with only errors',
      request: { t: 'load' as const, id: 'test-id', specs: [] },
      warnings: [],
      errors: ['error1']
    },
    {
      description: 'with undefined warnings and errors',
      request: { t: 'load' as const, id: 'test-id', specs: [] },
      warnings: undefined,
      errors: undefined
    }
  ])('should send load:ack message, $description', ({ request, warnings, errors }) => {
    const options: { warnings?: string[]; errors?: string[] } = {};

    if (warnings !== undefined) {
      options.warnings = warnings;
    }
    if (errors !== undefined) {
      options.errors = errors;
    }
    requestLoad(request, options);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      t: 'load:ack',
      id: request.id,
      warnings: warnings || [],
      errors: errors || []
    });
  });

  it('should not throw when process.send is undefined', () => {
    delete (process as any).send;

    expect(() => {
      requestLoad({ t: 'load' as const, id: 'test-id', specs: [] }, {});
    }).not.toThrow();
  });
});

describe('requestManifestGet', () => {
  let mockSend: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();
    process.send = mockSend;
  });

  afterEach(() => {
    delete (process as any).send;
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with empty descriptors',
      state: createTestHostState(),
      request: { t: 'manifest:get' as const, id: 'test-id' },
      expectedTools: []
    },
    {
      description: 'with single tool descriptor',
      state: (() => {
        const state = createTestHostState();

        state.descriptors.push({
          id: 'tool-1',
          name: 'Tool1',
          description: 'Description 1',
          inputSchema: {},
          source: 'module1'
        });

        return state;
      })(),
      request: { t: 'manifest:get' as const, id: 'test-id' },
      expectedTools: [
        {
          id: 'tool-1',
          name: 'Tool1',
          description: 'Description 1',
          inputSchema: {},
          source: 'module1'
        }
      ]
    },
    {
      description: 'with multiple tool descriptors',
      state: (() => {
        const state = createTestHostState();

        state.descriptors.push(
          {
            id: 'tool-1',
            name: 'Tool1',
            description: 'Description 1',
            inputSchema: { type: 'object' },
            source: 'module1'
          },
          {
            id: 'tool-2',
            name: 'Tool2',
            description: 'Description 2',
            inputSchema: {},
            source: 'module2'
          }
        );

        return state;
      })(),
      request: { t: 'manifest:get' as const, id: 'test-id' },
      expectedTools: [
        {
          id: 'tool-1',
          name: 'Tool1',
          description: 'Description 1',
          inputSchema: { type: 'object' },
          source: 'module1'
        },
        {
          id: 'tool-2',
          name: 'Tool2',
          description: 'Description 2',
          inputSchema: {},
          source: 'module2'
        }
      ]
    }
  ])('should send manifest:result message, $description', ({ state, request, expectedTools }) => {
    requestManifestGet(state, request);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      t: 'manifest:result',
      id: request.id,
      tools: expectedTools
    });
  });

  it('should not throw when process.send is undefined', () => {
    delete (process as any).send;

    expect(() => {
      requestManifestGet(createTestHostState(), { t: 'manifest:get' as const, id: 'test-id' });
    }).not.toThrow();
  });
});

describe('requestInvoke', () => {
  let mockSend: jest.Mock;
  let mockClearTimeout: jest.Mock;
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;

  beforeEach(() => {
    mockSend = jest.fn();
    process.send = mockSend;
    mockClearTimeout = jest.fn();
    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;
    global.clearTimeout = mockClearTimeout;
    jest.useFakeTimers();
  });

  afterEach(() => {
    delete (process as any).send;
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with successful handler',
      toolId: 'tool-1',
      args: { param: 'value' },
      handlerResult: { data: 'result' },
      expectedOk: true
    },
    {
      description: 'with handler returning promise',
      toolId: 'tool-1',
      args: { param: 'value' },
      handlerResult: { data: 'async-result' },
      handlerIsPromise: true,
      expectedOk: true
    },
    {
      description: 'with handler throwing error',
      toolId: 'tool-1',
      args: { param: 'value' },
      handlerError: new Error('Handler error'),
      expectedOk: false
    }
  ])('should handle tool invocation, $description', async ({ toolId, args, handlerResult, handlerError, handlerIsPromise, expectedOk }) => {
    const state = createTestHostState(1000);
    const handler = handlerError
      ? jest.fn().mockRejectedValue(handlerError)
      : handlerIsPromise
        ? jest.fn().mockResolvedValue(handlerResult)
        : jest.fn().mockReturnValue(handlerResult);
    const tool: McpTool = ['ToolName', { description: 'Tool description', inputSchema: {} }, handler];

    state.toolMap.set(toolId, tool);

    const request: IpcRequest = { t: 'invoke', id: 'request-id', toolId, args };
    const promise = requestInvoke(state, request);

    // Wait a bit for async operations
    await Promise.resolve();
    await promise;

    if (expectedOk) {
      expect(mockSend).toHaveBeenCalledWith({
        t: 'invoke:result',
        id: 'request-id',
        ok: true,
        result: handlerResult
      });
    } else {
      expect(mockSend).toHaveBeenCalledWith({
        t: 'invoke:result',
        id: 'request-id',
        ok: false,
        error: expect.objectContaining({
          message: handlerError?.message || expect.any(String)
        })
      });
    }
  });

  it('should send error when toolId not found', async () => {
    const state = createTestHostState();
    const request: IpcRequest = { t: 'invoke', id: 'request-id', toolId: 'unknown-tool', args: {} };

    await requestInvoke(state, request);

    expect(mockSend).toHaveBeenCalledWith({
      t: 'invoke:result',
      id: 'request-id',
      ok: false,
      error: { message: 'Unknown toolId' }
    });
  });

  it('should timeout when handler takes too long', async () => {
    const state = createTestHostState(100);
    // Create a handler that resolves after timeout would fire
    let resolveHandler: ((value: any) => void) | undefined;
    const handlerPromise = new Promise(resolve => {
      resolveHandler = resolve;
    });
    const handler = jest.fn(() => handlerPromise);
    const tool: McpTool = ['ToolName', { description: 'Tool description', inputSchema: {} }, handler];

    state.toolMap.set('tool-1', tool);

    const request: IpcRequest = { t: 'invoke', id: 'request-id', toolId: 'tool-1', args: {} };
    const invokePromise = requestInvoke(state, request);

    // Wait for handler to be called and timeout to be set up
    await Promise.resolve();
    await Promise.resolve();

    // Advance timers past timeout (100ms) - this should trigger the timeout
    jest.advanceTimersByTime(101);

    // Wait a bit for timeout message to be sent
    await Promise.resolve();

    // Verify timeout message was sent
    expect(mockSend).toHaveBeenCalledWith({
      t: 'invoke:result',
      id: 'request-id',
      ok: false,
      error: { message: 'Invoke timeout' }
    });

    // Now resolve the handler so the function can complete
    if (resolveHandler) {
      resolveHandler('result');
    }

    // Wait for the function to complete
    await invokePromise;
  });

  it('should not send multiple responses', async () => {
    const state = createTestHostState(100);
    const handler = jest.fn().mockResolvedValue('result');
    const tool: McpTool = ['ToolName', { description: 'Tool description', inputSchema: {} }, handler];

    state.toolMap.set('tool-1', tool);

    const request: IpcRequest = { t: 'invoke', id: 'request-id', toolId: 'tool-1', args: {} };
    const promise = requestInvoke(state, request);

    // Advance timer to trigger timeout
    jest.advanceTimersByTime(101);
    // Then resolve handler
    await Promise.resolve();

    await promise;

    // Should only send one response (timeout)
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});

describe('requestShutdown', () => {
  let mockSend: jest.Mock;
  let mockExit: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();
    mockExit = jest.fn();
    process.send = mockSend;
    process.exit = mockExit as any;
  });

  afterEach(() => {
    delete (process as any).send;
    delete (process as any).exit;
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with valid request',
      request: { t: 'shutdown' as const, id: 'test-id-1' }
    },
    {
      description: 'with different id',
      request: { t: 'shutdown' as const, id: 'test-id-2' }
    }
  ])('should send shutdown:ack and exit, $description', ({ request }) => {
    requestShutdown(request);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      t: 'shutdown:ack',
      id: request.id
    });
    expect(mockExit).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});

describe('requestFallback', () => {
  let mockSend: jest.Mock;

  beforeEach(() => {
    mockSend = jest.fn();
    process.send = mockSend;
  });

  afterEach(() => {
    delete (process as any).send;
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with request id',
      request: { t: 'hello' as const, id: 'test-id' } as IpcRequest,
      error: new Error('Test error')
    },
    {
      description: 'without request id',
      request: { t: 'load' as const, id: '', specs: [] } as IpcRequest,
      error: new Error('Test error')
    },
    {
      description: 'with string error',
      request: { t: 'invoke' as const, id: 'test-id', toolId: 'tool', args: {} } as IpcRequest,
      error: 'String error'
    }
  ])('should send error response, $description', ({ request, error }) => {
    requestFallback(request, error as Error);

    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith({
      t: 'invoke:result',
      id: request.id || 'n/a',
      ok: false,
      error: expect.objectContaining({
        message: expect.any(String)
      })
    });
  });

  it('should not throw when process.send is undefined', () => {
    delete (process as any).send;

    expect(() => {
      requestFallback({ t: 'hello', id: 'test-id' }, new Error('Test'));
    }).not.toThrow();
  });

  it('should not throw when send throws', () => {
    mockSend.mockImplementation(() => {
      throw new Error('Send failed');
    });

    expect(() => {
      requestFallback({ t: 'hello', id: 'test-id' }, new Error('Test'));
    }).not.toThrow();
  });
});

describe('setHandlers', () => {
  let mockOn: jest.Mock;
  let mockSend: jest.Mock;
  let messageHandlers: Array<(message: any) => void>;
  let disconnectHandlers: Array<() => void>;

  beforeEach(() => {
    messageHandlers = [];
    disconnectHandlers = [];
    mockSend = jest.fn();
    mockOn = jest.fn((event: string, handler: any) => {
      if (event === 'message') {
        messageHandlers.push(handler);
      } else if (event === 'disconnect') {
        disconnectHandlers.push(handler);
      }

      return process;
    });

    process.on = mockOn;
    process.send = mockSend;
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete (process as any).send;
  });

  it('should set up message and disconnect handlers', () => {
    const handler = setHandlers();

    expect(mockOn).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('disconnect', expect.any(Function));
    expect(typeof handler).toBe('function');
  });

  it('should handle hello request', async () => {
    const handler = setHandlers();
    const request: IpcRequest = { t: 'hello', id: 'test-id' };

    await handler(request);

    expect(mockSend).toHaveBeenCalledWith({ t: 'hello:ack', id: 'test-id' });
  });

  it('should handle manifest:get request', async () => {
    const handler = setHandlers();
    const request: IpcRequest = { t: 'manifest:get', id: 'test-id' };

    await handler(request);

    expect(mockSend).toHaveBeenCalledWith({ t: 'manifest:result', id: 'test-id', tools: [] });
  });

  it('should handle disconnect', () => {
    const mockExit = jest.fn();

    process.exit = mockExit as any;

    setHandlers();

    // Trigger disconnect handler
    disconnectHandlers.forEach(handler => handler());

    expect(mockExit).toHaveBeenCalledWith(0);

    delete (process as any).exit;
  });
});
