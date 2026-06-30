import { deferTask, MIN_INTERVAL_MS } from '../server.task';

describe('deferTask', () => {
  beforeEach(() => {
    jest.useFakeTimers();
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
    const handle = deferTask(mockFunc, { debug, timeoutMs: 10, ...options })();

    handle.isRunning();
    const startPromise = handle.start();

    if (options?.repeat && options.repeat > 1) {
      for (let i = 0; i < options.repeat; i++) {
        await jest.advanceTimersByTimeAsync(MIN_INTERVAL_MS);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      }
    }

    const result = await startPromise;

    expect(result).toBe(expected);
    expect(mockFunc).toHaveBeenCalledTimes(options?.repeat ?? 1);
    expect(debug.mock.calls).toMatchSnapshot();
  });

  it('should stop a task', async () => {
    const mockDebug = jest.fn();
    const mockFunc = jest.fn().mockReturnValue('stopped');
    const handle = deferTask(mockFunc, { debug: mockDebug, repeat: 5, timeoutMs: 100, intervalMs: MIN_INTERVAL_MS })();

    handle.start();
    expect(handle.isRunning()).toBe(true);

    handle.stop();
    expect(handle.isRunning()).toBe(false);

    expect(mockDebug.mock.calls).toMatchSnapshot();
    expect(mockFunc).toHaveBeenCalledTimes(1);
  });

  it('should cancel a task', async () => {
    const mockDebug = jest.fn();
    const mockFunc = jest.fn().mockReturnValue('lorem ipsum');
    const handle = deferTask(mockFunc, { debug: mockDebug, repeat: 3, cancelMs: 100, timeoutMs: 110, intervalMs: MIN_INTERVAL_MS })();

    await Promise.allSettled([
      handle.start(),
      jest.advanceTimersByTimeAsync(85)
    ]);

    expect(mockDebug.mock.calls.map(arr => ({ type: arr[0].type, value: arr[0].value() }))).toMatchSnapshot();

    expect(handle.isRunning()).toBe(false);
    expect(mockFunc).toHaveBeenCalledTimes(1);
  });

  it('should enforce a timeout', async () => {
    const mockDebug = jest.fn();
    const mockFunc = jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 500)));
    const handle = deferTask(mockFunc, { debug: mockDebug, timeoutMs: 100, errorMessage: 'Too slow' })();

    const result = handle.start();

    expect(handle.isRunning()).toBe(true);

    await Promise.all([
      expect(result).rejects.toThrow('Too slow'),
      jest.advanceTimersByTimeAsync(150)
    ]);

    expect(handle.isRunning()).toBe(false);
    expect(handle).toMatchSnapshot('handle');

    expect(mockDebug.mock.calls).toMatchSnapshot();
  });

  it('should introduce a delay between repetitions when intervalMs is provided', async () => {
    const mockFunc = jest.fn().mockReturnValue('lorem');
    const handle = deferTask(mockFunc, { repeat: 3, intervalMs: 500, timeoutMs: 100 })();

    const startPromise = handle.start();

    // First execution runs immediately
    await jest.advanceTimersByTimeAsync(0);
    expect(mockFunc).toHaveBeenCalledTimes(1);

    // After 500ms, second execution runs
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
    const handle = deferTask(mockFunc, { repeat: 3, intervalMs: 5000, timeoutMs: 100 })();

    const startPromise = handle.start();

    // First execution runs immediately
    await jest.advanceTimersByTimeAsync(0);
    expect(mockFunc).toHaveBeenCalledTimes(1);

    // Stop while in the 5000ms delay before second execution
    const stopPromise = handle.stop();

    // The start promise should resolve immediately and not run mockFunc again
    await startPromise;
    await stopPromise;

    expect(mockFunc).toHaveBeenCalledTimes(1);
    expect(handle.isRunning()).toBe(false);
  });

  it.each([
    {
      description: 'zero intervalMs',
      expected: 'deferTask: intervalMs must be >= 250ms received 0 instead',
      options: { repeat: 3, intervalMs: 0 }
    },
    {
      description: 'intervalMs is less than MIN_INTERVAL_MS',
      expected: `deferTask: intervalMs must be >= 250ms received 100 instead`,
      options: { repeat: 3, intervalMs: 100 }
    }
  ])('should throw an error for intervalMs, $description', ({ expected, options }) => {
    const mockFunc = jest.fn();

    expect(() => {
      deferTask(mockFunc, options as any)();
    }).toThrow(expected);
  });
});
