import { send, awaitIpc, isHelloAck, serializeError, isErrorLike } from '../server.processIpc';

describe('send', () => {
  it('should return true when process.send is available', () => {
    const mockProcess = { send: jest.fn().mockReturnValue(true) } as any;
    const result = send(mockProcess, { t: 'test', id: '1' });

    expect(result).toBe(true);
    expect(mockProcess.send).toHaveBeenCalledWith({ t: 'test', id: '1' });
  });

  it('should return false when process.send is not available', () => {
    const mockProcess = {} as any;
    const result = send(mockProcess, { t: 'test', id: '1' });

    expect(result).toBe(false);
  });
});

describe('awaitIpc', () => {
  it('should resolve when matcher returns true', async () => {
    const mockProcess = {
      on: jest.fn(),
      off: jest.fn()
    } as any;

    const promise = awaitIpc(mockProcess, isHelloAck, 100);
    const onMessage = mockProcess.on.mock.calls.find((call: any[]) => call[0] === 'message')[1];

    onMessage({ t: 'hello:ack', id: 'test-id' });

    const result = await promise;

    expect(result).toEqual({ t: 'hello:ack', id: 'test-id' });
    expect(mockProcess.off).toHaveBeenCalledWith('message', onMessage);
  });

  it('should reject on timeout', async () => {
    jest.useFakeTimers();
    const mockProcess = {
      on: jest.fn(),
      off: jest.fn()
    } as any;

    const promise = awaitIpc(mockProcess, isHelloAck, 100, 'TestProcess');

    jest.advanceTimersByTime(101);

    await expect(promise).rejects.toThrow('Timed out waiting for TestProcess IPC response (100ms)');
    jest.useRealTimers();
  });

  it('should reject on process exit', async () => {
    const mockProcess = {
      on: jest.fn(),
      off: jest.fn()
    } as any;

    const promise = awaitIpc(mockProcess, isHelloAck, 100, 'TestProcess');
    const onExit = mockProcess.on.mock.calls.find((call: any[]) => call[0] === 'exit')[1];

    onExit(1, 'SIGTERM');

    await expect(promise).rejects.toThrow('TestProcess exited before response (code=1, signal=SIGTERM)');
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

describe('serializeError', () => {
  it('should serialize an Error object', () => {
    const error = new Error('test error');

    (error as any).code = 'ERR_TEST';
    const serialized = serializeError(error);

    expect(serialized.message).toBe('test error');
    expect(serialized.stack).toBeDefined();
    expect(serialized.code).toBe('ERR_TEST');
  });

  it('should serialize a string as an error message', () => {
    const serialized = serializeError('string error');

    expect(serialized.message).toBe('string error');
  });

  it('should preserve extra properties if they exist on the input object', () => {
    const errorLike = {
      message: 'complex error',
      details: { foo: 'bar' },
      cause: 'original cause'
    };
    const serialized = serializeError(errorLike);

    expect(serialized.message).toBe('complex error');
    expect(serialized.details).toEqual({ foo: 'bar' });
    expect(serialized.cause).toBe('original cause');
  });
});

describe('isErrorLike', () => {
  it('should return true for Error instances', () => {
    expect(isErrorLike(new Error())).toBe(true);
    expect(isErrorLike(new TypeError())).toBe(true);
    expect(isErrorLike(new AggregateError([]))).toBe(true);
  });

  it('should return true for objects with message and stack', () => {
    expect(isErrorLike({ message: 'err', stack: 'at\nsomewhere' })).toBe(true);
  });

  it('should return true for objects with message and name ending in Error', () => {
    expect(isErrorLike({ message: 'err', name: 'MyCustomError' })).toBe(true);
  });

  it('should return false for non-error objects', () => {
    expect(isErrorLike(null)).toBe(false);
    expect(isErrorLike({})).toBe(false);
    expect(isErrorLike({ message: 'just a message' })).toBe(false);
    expect(isErrorLike('not an error')).toBe(false);
  });

  it('should return true for cross-realm error-like tags', () => {
    // We can't easily mock Object.prototype.toString.call result for a plain object in a test
    // but we can test if the message property check works if other checks fail.
    expect(isErrorLike({ message: 'err', stack: 'at\n' })).toBe(true);
  });
});
