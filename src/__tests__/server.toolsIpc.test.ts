import { type ChildProcess } from 'node:child_process';
import {
  makeId,
  send,
  awaitIpc,
  isHelloAck,
  isLoadAck,
  isManifestResult,
  isInvokeResult,
  type IpcRequest,
  type IpcResponse
} from '../server.toolsIpc';

describe('makeId', () => {
  it.each([
    {
      description: 'generates unique IDs',
      count: 10
    }
  ])('should generate unique IDs, $description', ({ count }) => {
    const ids = new Set<string>();

    for (let i = 0; i < count; i++) {
      ids.add(makeId());
    }

    expect(ids.size).toBe(count);
    const firstId = Array.from(ids)[0];

    expect(typeof firstId).toBe('string');
    expect(firstId?.length).toBeGreaterThan(0);
  });

  it('should generate UUID format', () => {
    const id = makeId();

    // UUID v4 format: 8-4-4-4-12 hex digits
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});

describe('send', () => {
  let mockProcess: NodeJS.Process;
  let mockChildProcess: ChildProcess;

  beforeEach(() => {
    mockProcess = {
      send: jest.fn().mockReturnValue(true)
    } as any;

    mockChildProcess = {
      send: jest.fn().mockReturnValue(true)
    } as any;
  });

  it.each([
    {
      description: 'hello request',
      request: { t: 'hello', id: 'test-id' } as IpcRequest
    },
    {
      description: 'load request',
      request: { t: 'load', id: 'test-id', specs: ['module1', 'module2'] } as IpcRequest
    },
    {
      description: 'load request with invokeTimeoutMs',
      request: { t: 'load', id: 'test-id', specs: ['module1'], invokeTimeoutMs: 5000 } as IpcRequest
    },
    {
      description: 'manifest:get request',
      request: { t: 'manifest:get', id: 'test-id' } as IpcRequest
    },
    {
      description: 'invoke request',
      request: { t: 'invoke', id: 'test-id', toolId: 'tool1', args: { param: 'value' } } as IpcRequest
    },
    {
      description: 'shutdown request',
      request: { t: 'shutdown', id: 'test-id' } as IpcRequest
    }
  ])('should send IPC message, $description', ({ request }) => {
    const result = send(mockProcess, request);

    expect(result).toBe(true);
    expect(mockProcess.send).toHaveBeenCalledTimes(1);
    expect(mockProcess.send).toHaveBeenCalledWith(request);
  });

  it.each([
    {
      description: 'with ChildProcess',
      processRef: 'childProcess' as const
    },
    {
      description: 'with NodeJS.Process',
      processRef: 'process' as const
    }
  ])('should send to process, $description', ({ processRef }) => {
    const proc = processRef === 'childProcess' ? mockChildProcess : mockProcess;
    const request: IpcRequest = { t: 'hello', id: 'test-id' };

    const result = send(proc, request);

    expect(result).toBe(true);
    expect(proc.send).toHaveBeenCalledWith(request);
  });

  it('should return false when send is not available', () => {
    const processWithoutSend = {} as NodeJS.Process;

    const result = send(processWithoutSend, { t: 'hello', id: 'test-id' });

    expect(result).toBe(false);
  });

  it('should return false when send returns false', () => {
    const processWithFailingSend = {
      send: jest.fn().mockReturnValue(false)
    } as any;

    const result = send(processWithFailingSend, { t: 'hello', id: 'test-id' });

    expect(result).toBe(false);
  });
});

describe('isHelloAck', () => {
  it.each([
    {
      description: 'valid hello:ack message',
      message: { t: 'hello:ack', id: 'test-id' },
      expected: true
    },
    {
      description: 'invalid type',
      message: { t: 'hello', id: 'test-id' },
      expected: false
    },
    {
      description: 'missing type',
      message: { id: 'test-id' },
      expected: false
    },
    {
      description: 'missing id',
      message: { t: 'hello:ack' },
      expected: false
    },
    {
      description: 'non-string id',
      message: { t: 'hello:ack', id: 123 },
      expected: false
    },
    {
      description: 'null message',
      message: null,
      expected: false
    },
    {
      description: 'undefined message',
      message: undefined,
      expected: false
    },
    {
      description: 'empty object',
      message: {},
      expected: false
    }
  ])('should check if message is hello:ack, $description', ({ message, expected }) => {
    expect(isHelloAck(message)).toBe(expected);
  });
});

describe('isLoadAck', () => {
  it.each([
    {
      description: 'valid load:ack message with matching id',
      message: { t: 'load:ack', id: 'test-id', warnings: [], errors: [] },
      expectedId: 'test-id',
      expected: true
    },
    {
      description: 'valid load:ack with warnings and errors',
      message: { t: 'load:ack', id: 'test-id', warnings: ['warning1'], errors: ['error1'] },
      expectedId: 'test-id',
      expected: true
    },
    {
      description: 'mismatched id',
      message: { t: 'load:ack', id: 'other-id', warnings: [], errors: [] },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'invalid type',
      message: { t: 'load', id: 'test-id', warnings: [], errors: [] },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'missing warnings',
      message: { t: 'load:ack', id: 'test-id', errors: [] },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'missing errors',
      message: { t: 'load:ack', id: 'test-id', warnings: [] },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'non-array warnings',
      message: { t: 'load:ack', id: 'test-id', warnings: 'not-array', errors: [] },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'non-array errors',
      message: { t: 'load:ack', id: 'test-id', warnings: [], errors: 'not-array' },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'null message',
      message: null,
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'undefined message',
      message: undefined,
      expectedId: 'test-id',
      expected: false
    }
  ])('should check if message is load:ack, $description', ({ message, expectedId, expected }) => {
    const matcher = isLoadAck(expectedId);

    expect(matcher(message)).toBe(expected);
  });
});

describe('isManifestResult', () => {
  it.each([
    {
      description: 'valid manifest:result with matching id',
      message: { t: 'manifest:result', id: 'test-id', tools: [] },
      expectedId: 'test-id',
      expected: true
    },
    {
      description: 'valid manifest:result with tools',
      message: {
        t: 'manifest:result',
        id: 'test-id',
        tools: [
          { id: 'tool1', name: 'Tool1', description: 'Description', inputSchema: {} }
        ]
      },
      expectedId: 'test-id',
      expected: true
    },
    {
      description: 'mismatched id',
      message: { t: 'manifest:result', id: 'other-id', tools: [] },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'invalid type',
      message: { t: 'manifest', id: 'test-id', tools: [] },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'missing tools',
      message: { t: 'manifest:result', id: 'test-id' },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'non-array tools',
      message: { t: 'manifest:result', id: 'test-id', tools: 'not-array' },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'null message',
      message: null,
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'undefined message',
      message: undefined,
      expectedId: 'test-id',
      expected: false
    }
  ])('should check if message is manifest:result, $description', ({ message, expectedId, expected }) => {
    const matcher = isManifestResult(expectedId);

    expect(matcher(message)).toBe(expected);
  });
});

describe('isInvokeResult', () => {
  it.each([
    {
      description: 'valid invoke:result with ok:true and matching id',
      message: { t: 'invoke:result', id: 'test-id', ok: true, result: { data: 'value' } },
      expectedId: 'test-id',
      expected: true
    },
    {
      description: 'valid invoke:result with ok:false and error',
      message: {
        t: 'invoke:result',
        id: 'test-id',
        ok: false,
        error: { message: 'Error message', stack: 'stack trace', code: 'ERROR_CODE' }
      },
      expectedId: 'test-id',
      expected: true
    },
    {
      description: 'mismatched id',
      message: { t: 'invoke:result', id: 'other-id', ok: true, result: {} },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'invalid type',
      message: { t: 'invoke', id: 'test-id', ok: true, result: {} },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'missing id',
      message: { t: 'invoke:result', ok: true, result: {} },
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'null message',
      message: null,
      expectedId: 'test-id',
      expected: false
    },
    {
      description: 'undefined message',
      message: undefined,
      expectedId: 'test-id',
      expected: false
    }
  ])('should check if message is invoke:result, $description', ({ message, expectedId, expected }) => {
    const matcher = isInvokeResult(expectedId);

    expect(matcher(message)).toBe(expected);
  });
});

describe('awaitIpc', () => {
  let mockProcess: NodeJS.Process;
  let messageHandlers: Array<(message: any) => void>;
  let exitHandlers: Array<(code?: number, signal?: string) => void>;
  let disconnectHandlers: Array<() => void>;

  beforeEach(() => {
    messageHandlers = [];
    exitHandlers = [];
    disconnectHandlers = [];

    mockProcess = {
      on: jest.fn((event: string, handler: any) => {
        if (event === 'message') {
          messageHandlers.push(handler);
        } else if (event === 'exit') {
          exitHandlers.push(handler);
        } else if (event === 'disconnect') {
          disconnectHandlers.push(handler);
        }

        return mockProcess;
      }),
      off: jest.fn((event: string, handler: any) => {
        if (event === 'message') {
          const index = messageHandlers.indexOf(handler);

          if (index > -1) {
            messageHandlers.splice(index, 1);
          }
        } else if (event === 'exit') {
          const index = exitHandlers.indexOf(handler);

          if (index > -1) {
            exitHandlers.splice(index, 1);
          }
        } else if (event === 'disconnect') {
          const index = disconnectHandlers.indexOf(handler);

          if (index > -1) {
            disconnectHandlers.splice(index, 1);
          }
        }

        return mockProcess;
      })
    } as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'hello:ack message',
      response: { t: 'hello:ack', id: 'test-id' },
      timeoutMs: 1000
    },
    {
      description: 'load:ack message',
      response: { t: 'load:ack', id: 'test-id', warnings: [], errors: [] },
      timeoutMs: 1000
    },
    {
      description: 'manifest:result message',
      response: { t: 'manifest:result', id: 'test-id', tools: [] },
      timeoutMs: 1000
    },
    {
      description: 'invoke:result with ok:true',
      response: { t: 'invoke:result', id: 'test-id', ok: true, result: { data: 'value' } },
      timeoutMs: 1000
    },
    {
      description: 'invoke:result with ok:false',
      response: {
        t: 'invoke:result',
        id: 'test-id',
        ok: false,
        error: { message: 'Error' }
      },
      timeoutMs: 1000
    }
  ])('should await and resolve IPC response, $description', async ({ response, timeoutMs }) => {
    let promise: Promise<IpcResponse>;

    if (response.t === 'hello:ack') {
      promise = awaitIpc(mockProcess, isHelloAck, timeoutMs);
    } else if (response.t === 'load:ack') {
      promise = awaitIpc(mockProcess, isLoadAck(response.id), timeoutMs);
    } else if (response.t === 'manifest:result') {
      promise = awaitIpc(mockProcess, isManifestResult(response.id), timeoutMs);
    } else {
      promise = awaitIpc(mockProcess, isInvokeResult(response.id), timeoutMs);
    }

    // Simulate message arrival - wait for handlers to be registered, then trigger
    await Promise.resolve();
    messageHandlers.forEach(handler => handler(response));

    const result = await promise;

    expect(result).toEqual(response);
    expect(mockProcess.on).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockProcess.on).toHaveBeenCalledWith('exit', expect.any(Function));
    expect(mockProcess.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  it('should ignore non-matching messages', async () => {
    const matchingResponse = { t: 'hello:ack', id: 'test-id' };
    const nonMatchingResponse = { t: 'other:type', id: 'test-id' };

    const promise = awaitIpc(mockProcess, isHelloAck, 1000);

    // Wait for handlers to be registered
    await Promise.resolve();

    // Send non-matching message first
    messageHandlers.forEach(handler => handler(nonMatchingResponse));
    // Then send matching message
    await Promise.resolve();
    messageHandlers.forEach(handler => handler(matchingResponse));

    const result = await promise;

    expect(result).toEqual(matchingResponse);
  });

  it.each([
    {
      description: 'process exit',
      event: 'exit' as const,
      code: 1,
      signal: 'SIGTERM'
    },
    {
      description: 'process disconnect',
      event: 'disconnect' as const,
      code: undefined,
      signal: undefined
    }
  ])('should reject when process $description', async ({ event, code, signal }) => {
    const promise = awaitIpc(mockProcess, isHelloAck, 1000);

    // Wait for handlers to be registered
    await Promise.resolve();

    // Simulate process exit/disconnect
    if (event === 'exit') {
      exitHandlers.forEach(handler => handler(code, signal));
    } else {
      disconnectHandlers.forEach(handler => handler());
    }

    await expect(promise).rejects.toThrow('Tools Host exited before response');
  });

  it('should reject on timeout', async () => {
    jest.useFakeTimers();
    const promise = awaitIpc(mockProcess, isHelloAck, 1000);

    // Advance time past timeout
    jest.advanceTimersByTime(1001);

    await expect(promise).rejects.toThrow('Timed out waiting for IPC response');
    jest.useRealTimers();
  });

  it('should cleanup event listeners on resolve', async () => {
    const response = { t: 'hello:ack', id: 'test-id' };
    const promise = awaitIpc(mockProcess, isHelloAck, 1000);

    await Promise.resolve();
    messageHandlers.forEach(handler => handler(response));

    await promise;

    expect(mockProcess.off).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockProcess.off).toHaveBeenCalledWith('exit', expect.any(Function));
    expect(mockProcess.off).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  it('should cleanup event listeners on reject', async () => {
    jest.useFakeTimers();
    const promise = awaitIpc(mockProcess, isHelloAck, 1000);

    jest.advanceTimersByTime(1001);

    try {
      await promise;
    } catch {
      // Expected to reject
    }
    jest.useRealTimers();

    expect(mockProcess.off).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockProcess.off).toHaveBeenCalledWith('exit', expect.any(Function));
    expect(mockProcess.off).toHaveBeenCalledWith('disconnect', expect.any(Function));
  });

  it('should not resolve multiple times', async () => {
    const response1 = { t: 'hello:ack', id: 'test-id-1' };
    const response2 = { t: 'hello:ack', id: 'test-id-2' };

    const promise = awaitIpc(mockProcess, isHelloAck, 1000);

    await Promise.resolve();
    messageHandlers.forEach(handler => handler(response1));
    messageHandlers.forEach(handler => handler(response2));

    const result = await promise;

    expect(result).toEqual(response1);
  });
});
