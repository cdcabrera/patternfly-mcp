import { deferTask, MIN_TIMEOUT_MS } from '../server.task';

describe('deferTask', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setTimeout(10000);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'sync',
      mockFunc: jest.fn().mockReturnValue('lorem ipsum'),
      expected: 'lorem ipsum'
    },
    {
      description: 'async',
      mockFunc: jest.fn().mockResolvedValue('lorem ipsum'),
      expected: 'lorem ipsum'
    },
    {
      description: 'sync options',
      mockFunc: jest.fn().mockReturnValue('lorem ipsum'),
      options: { repeat: 3 },
      expected: 'lorem ipsum'
    },
    {
      description: 'async options',
      mockFunc: jest.fn().mockResolvedValue('lorem ipsum'),
      options: { repeat: 3 },
      expected: 'lorem ipsum'
    }
  ])('should execute a task, $description', async ({ mockFunc, options, expected }) => {
    const debug = jest.fn();
    const handle = deferTask(mockFunc, { debug, timeoutMs: MIN_TIMEOUT_MS, randomizedDelayMs: 1, ...options })();

    handle.isRunning();
    const startPromise = handle.start();

    const repeat = options?.repeat ?? 1;

    for (let i = 0; i < repeat; i++) {
      await jest.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }

    const result = await startPromise;

    expect(result).toBe(expected);
    expect(mockFunc).toHaveBeenCalledTimes(options?.repeat ?? 1);
    expect(debug.mock.calls).toMatchSnapshot();
  });

  it('should stop a task', async () => {
    const mockDebug = jest.fn();
    const mockFunc = jest.fn().mockReturnValue('stopped');
    const handle = deferTask(mockFunc, { debug: mockDebug, repeat: 5, timeoutMs: MIN_TIMEOUT_MS, randomizedDelayMs: 1 })();

    const startPromise = handle.start();

    await jest.advanceTimersByTimeAsync(1);
    expect(handle.isRunning()).toBe(true);

    await handle.stop();
    await startPromise;
    expect(handle.isRunning()).toBe(false);

    expect(mockDebug.mock.calls).toMatchSnapshot();
    expect(mockFunc).toHaveBeenCalledTimes(1);
  });

  it('should cancel a task', async () => {
    const mockDebug = jest.fn();
    const mockFunc = jest.fn().mockReturnValue('lorem ipsum');
    const handle = deferTask(mockFunc, { debug: mockDebug, repeat: 3, cancelMs: 100, timeoutMs: MIN_TIMEOUT_MS, randomizedDelayMs: 5 })();

    const startPromise = handle.start();

    await jest.advanceTimersByTimeAsync(50);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await startPromise.catch(() => {});

    expect(mockDebug.mock.calls.map(arr => ({ type: arr[0].type, value: arr[0].value() }))).toMatchSnapshot();

    expect(handle.isRunning()).toBe(false);
    expect(mockFunc).toHaveBeenCalled();
  });

  it('should enforce a timeout', async () => {
    const mockDebug = jest.fn();
    const mockFunc = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 500)));
    const handle = deferTask(mockFunc, { debug: mockDebug, timeoutMs: MIN_TIMEOUT_MS, randomizedDelayMs: 250, errorMessage: 'Too slow' })();

    const startPromise = handle.start();

    expect(handle.isRunning()).toBe(true);

    // Initial delay
    await jest.advanceTimersByTimeAsync(250);

    await Promise.all([
      expect(startPromise).rejects.toThrow('Too slow'),
      jest.advanceTimersByTimeAsync(500)
    ]);

    expect(handle.isRunning()).toBe(false);
    expect(handle).toMatchSnapshot('handle');

    expect(mockDebug.mock.calls).toMatchSnapshot();
  });

  it('should introduce a delay before each execution when timeoutMs is provided', async () => {
    const mockFunc = jest.fn().mockReturnValue('lorem');
    const handle = deferTask(mockFunc, { repeat: 3, timeoutMs: 500, randomizedDelayMs: 500 })();

    const startPromise = handle.start();

    // Initial delay before first execution
    await jest.advanceTimersByTimeAsync(500);
    expect(mockFunc).toHaveBeenCalledTimes(1);

    // After another 500ms, second execution runs
    await jest.advanceTimersByTimeAsync(500);
    expect(mockFunc).toHaveBeenCalledTimes(2);

    // After another 500ms, third execution runs
    await jest.advanceTimersByTimeAsync(500);
    expect(mockFunc).toHaveBeenCalledTimes(3);

    const result = await startPromise;

    expect(result).toBe('lorem');
  });

  it('should stop immediately and cancel the delay when stop is called', async () => {
    const mockFunc = jest.fn().mockReturnValue('ipsum');
    const handle = deferTask(mockFunc, { repeat: 3, timeoutMs: MIN_TIMEOUT_MS, randomizedDelayMs: 5000 })();

    const startPromise = handle.start();

    // Stop while in the initial 5000ms delay before first execution
    const stopPromise = handle.stop();

    // The start promise should resolve immediately and not run mockFunc
    await startPromise;
    await stopPromise;

    expect(mockFunc).toHaveBeenCalledTimes(0);
    expect(handle.isRunning()).toBe(false);
  });

  it.each([
    {
      description: 'zero timeoutMs',
      expected: `deferTask: timeoutMs must be >= ${MIN_TIMEOUT_MS}ms received 0 instead`,
      options: { repeat: 3, timeoutMs: 0 }
    },
    {
      description: 'timeoutMs is less than MIN_TIMEOUT_MS',
      expected: `deferTask: timeoutMs must be >= ${MIN_TIMEOUT_MS}ms received 100 instead`,
      options: { repeat: 3, timeoutMs: 100 }
    }
  ])('should throw an error for timeoutMs, $description', ({ expected, options }) => {
    const mockFunc = jest.fn();

    expect(() => {
      deferTask(mockFunc, options as any)();
    }).toThrow(expected);
  });
});
