import { memo } from '../server.caching';

describe('memo', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    {
      description: 'default',
      options: {},
      params: [[], [], [1], [1], [2], [2], [3], [3], [1]]
    },
    {
      description: 'cacheLimit',
      options: { cacheLimit: 2 },
      params: [[], [], [1], [1], [2], [2], [3], [3], [1]]
    },
    {
      description: 'errors cached',
      options: { cacheLimit: 3, cacheErrors: true },
      params: [[7, true], [7, true], [8], [8], [9, true], [9, true], [7, true], [10]]
    },
    {
      description: 'errors NOT cached',
      options: { cacheLimit: 3, cacheErrors: false },
      params: [[7, true], [7, true], [8], [8], [9, true], [9, true], [7, true], [10]]
    },
    {
      description: 'disable memoization when cacheLimit is zero',
      options: { cacheLimit: 0 },
      params: [[], [], [1], [1], [2, true], [2, true]]
    },
    {
      description: 'allow custom key hashing',
      options: {
        keyHash: (value: unknown) => `custom-hash-${value}`
      },
      params: [[], [], [1], [1], [2, true], [2, true]]
    }
  ])('should memoize a function, $description', async ({ options, params }) => {
    const log: any[] = [];
    const logAsync: any[] = [];
    const debug = (response: any) => log.push(response);
    const debugAsync = (response: any) => logAsync.push(response);
    const updateLog = async (aLog: any) => {
      const updatedLog = [];

      for (const { type, value, cache } of aLog) {
        let successValue;
        let errorValue;

        try {
          successValue = await value();
        } catch (err) {
          const error = err as Error;

          errorValue = error.message;
        }

        successValue = successValue?.split?.('-')[1];
        errorValue = errorValue?.split?.('-')[1];

        updatedLog.push({
          type,
          successValue,
          errorValue,
          cacheKeys: cache.filter((_value: any, index: number) => index % 2 === 0).filter(Boolean),
          cacheLength: cache.length
        });
      }

      return updatedLog;
    };

    const memoized = memo(
      (str, isError = false) => {
        const arr = ['lorem', 'ipsum', 'dolor', 'sit'];
        const randomStr = Math.floor(Math.random() * arr.length);
        const genStr = `${arr[randomStr]}-${str || '[EMPTY]'}`;

        if (isError) {
          throw new Error(genStr);
        }

        return genStr;
      },
      { debug, ...options }
    );

    const memoizedAsync = memo(
      async (str, isError = false) => {
        const arr = ['lorem', 'ipsum', 'dolor', 'sit'];
        const randomStr = Math.floor(Math.random() * arr.length);
        const genStr = `${arr[randomStr]}-${str || '[EMPTY]'}`;

        if (isError) {
          throw new Error(genStr);
        }

        return genStr;
      },
      { debug: debugAsync, ...options }
    );

    for (const param of params) {
      try {
        memoized(...param as [unknown]);
      } catch {}
    }

    for (const param of params) {
      try {
        await memoizedAsync(...param as [unknown]);
      } catch {}
    }

    await expect(updateLog(log)).resolves.toMatchSnapshot('sync');
    await expect(updateLog(logAsync)).resolves.toMatchSnapshot('async');
  });

  it.each([
    {
      description: 'default with cacheErrors',
      options: { expire: 10, cacheErrors: true },
      params: [[1], [1], [2, true], [2, true], [3], [3]],
      pause: 70
    },
    {
      description: 'default with cacheErrors, error last',
      options: { expire: 10, cacheErrors: true },
      params: [[1], [1], [2, true], [2, true]],
      pause: 70
    },
    {
      description: 'default with NO cacheErrors',
      options: { expire: 10, cacheErrors: false },
      params: [[1], [1], [2, true], [2, true], [3], [3]],
      pause: 70
    },
    {
      description: 'default with NO cacheErrors, error last',
      options: { expire: 10, cacheErrors: false },
      params: [[1], [1], [2, true], [2, true]],
      pause: 70
    },
    {
      description: 'cacheLimit with cacheErrors',
      options: { cacheLimit: 3, expire: 10, cacheErrors: true },
      params: [[], [], [1], [1], [2], [2], [3, true], [3, true], [4], [4]],
      pause: 70
    },
    {
      description: 'cacheLimit with cacheErrors, error last',
      options: { cacheLimit: 3, expire: 10, cacheErrors: true },
      params: [[], [], [1], [1], [2], [2], [3, true], [3, true]],
      pause: 70
    },
    {
      description: 'cacheLimit with NO cacheErrors',
      options: { cacheLimit: 3, expire: 10, cacheErrors: false },
      params: [[], [], [1], [1], [2], [2], [3, true], [3, true], [4], [4]],
      pause: 70
    },
    {
      description: 'cacheLimit with NO cacheErrors, error last',
      options: { cacheLimit: 3, expire: 10, cacheErrors: false },
      params: [[], [], [1], [1], [2], [2], [3, true], [3, true]],
      pause: 70
    }
  ])('should clear cache on inactivity and fire "onCacheExpire", $description', async ({ options, params, pause }) => {
    const log: any[] = [];
    const logAsync: any[] = [];
    const mockOnCacheExpire = (response: unknown) => {
      log.push(response);
    };
    const mockOnCacheExpireAsync = async (response: unknown) => {
      logAsync.push(response);
    };
    const updateLog = async (aLog: any) => {
      const sanitizedLog = [];

      for (const { all, removed, remaining } of aLog) {
        const sanitized = {
          all: [] as any[],
          removed: [] as any[],
          remaining: [] as any[]
        };
        let updatedAll: any[] = [];
        let updatedRemaining: any[] = [];
        let updatedRemoved: any[] = [];

        updatedAll = await Promise.allSettled(all);
        updatedRemoved = await Promise.allSettled(removed);
        updatedRemaining = await Promise.allSettled(remaining);

        if (updatedAll) {
          sanitized.all.push(...updatedAll);
        }

        if (updatedRemoved) {
          sanitized.removed.push(...updatedRemoved);
        }
        if (updatedRemaining) {
          sanitized.remaining.push(...updatedRemaining);
        }
        sanitizedLog.push(sanitized);
      }

      return sanitizedLog;
    };

    const memoized = memo(
      (str: any, isError = false) => {
        const genStr = `${str}`;

        if (isError) {
          throw new Error(`onCacheRollout-${genStr}`);
        }

        return genStr;
      },
      { onCacheExpire: mockOnCacheExpire, ...options }
    );

    const memoizedAsync = memo(
      async (str: any, isError = false) => {
        const genStr = `${str}`;

        if (isError) {
          throw new Error(`onCacheRollout-${genStr}`);
        }

        return genStr;
      },
      { onCacheExpire: mockOnCacheExpireAsync, ...options }
    );

    for (const param of params) {
      try {
        await memoized(...param as [unknown]);
      } catch {}
    }

    jest.advanceTimersByTime(pause);

    for (const param of params) {
      try {
        await memoizedAsync(...param as [unknown]);
      } catch {}
    }

    jest.advanceTimersByTime(pause);

    await expect(updateLog(log)).resolves.toMatchSnapshot('sync');
    await expect(updateLog(logAsync)).resolves.toMatchSnapshot('async');
  });

  it.each([
    {
      description: 'no entries removed',
      options: { cacheLimit: 3 },
      params: [[], [], [1], [1], [2], [2]]
    },
    {
      description: 'one entry removed',
      options: { cacheLimit: 3 },
      params: [[], [], [1], [1], [2], [2], [3]]
    },
    {
      description: 'multiple entries removed',
      options: { cacheLimit: 3 },
      params: [[], [], [1], [1], [2], [2], [3], [4]]
    },
    {
      description: 'multiple entries removed, errors not cached',
      options: { cacheLimit: 3, cacheErrors: false },
      params: [[], [], [1, true], [1, true], [2], [2], [3], [4]]
    },
    {
      description: 'multiple entries removed, errors cached',
      options: { cacheLimit: 3, cacheErrors: true },
      params: [[], [], [1, true], [1, true], [2], [2], [3], [4]]
    }
  ])('should fire "onCacheRollout" callback on cache rollout, $description', async ({ options, params }) => {
    const log: any[] = [];
    const logAsync: any[] = [];
    const mockOnCacheRollout = (response: unknown) => {
      log.push(response);
    };
    const mockOnCacheRolloutAsync = async (response: unknown) => {
      logAsync.push(response);
    };
    const updateLog = async (aLog: any) => {
      const sanitizedLog = [];

      for (const { removed, remaining } of aLog) {
        const sanitized = {
          removed: [] as any[],
          remaining: [] as any[]
        };
        let updatedRemaining: any[] = [];
        let updatedRemoved: any[] = [];

        updatedRemoved = await Promise.allSettled(removed);
        updatedRemaining = await Promise.allSettled(remaining);

        if (updatedRemoved) {
          sanitized.removed.push(...updatedRemoved);
        }
        if (updatedRemaining) {
          sanitized.remaining.push(...updatedRemaining);
        }
        sanitizedLog.push(sanitized);
      }

      return sanitizedLog;
    };

    const memoized = memo(
      (str: any, isError = false) => {
        const genStr = `${str}`;

        if (isError) {
          throw new Error(`onCacheRollout-${genStr}`);
        }

        return genStr;
      },
      { onCacheRollout: mockOnCacheRollout, ...options }
    );

    const memoizedAsync = memo(
      async (str: any, isError = false) => {
        const genStr = `${str}`;

        if (isError) {
          throw new Error(`onCacheRollout-${genStr}`);
        }

        return genStr;
      },
      { onCacheRollout: mockOnCacheRolloutAsync, ...options }
    );

    for (const param of params) {
      try {
        await memoized(...param as [unknown]);
      } catch {}
    }

    for (const param of params) {
      try {
        await memoizedAsync(...param as [unknown]);
      } catch {}
    }

    await expect(updateLog(log)).resolves.toMatchSnapshot('sync');
    await expect(updateLog(logAsync)).resolves.toMatchSnapshot('async');
  });

  it.each([
    {
      description: 'clear all entries',
      setup: (mem: any) => {
        mem(1);
        mem(2);
        mem(3);
      },
      action: (mem: any) => mem.clear(),
      expectedResult: true,
      expectedRemainingCount: 0
    },
    {
      description: 'clear specific key',
      setup: (mem: any) => {
        mem(1);
        mem(2);
      },
      action: (mem: any) => {
        const key = mem.getKey(1);

        return mem.clear(key);
      },
      expectedResult: true,
      expectedRemainingCount: 1
    },
    {
      description: 'clear non-existent key',
      setup: (mem: any) => { mem(1); },
      action: (mem: any) => mem.clear('non-existent'),
      expectedResult: false,
      expectedRemainingCount: 1
    }
  ])('should handle clear() without callback, $description', ({ setup, action, expectedResult, expectedRemainingCount }) => {
    const memoized = memo((val: number) => val + 1, { cacheLimit: 10 });

    setup(memoized);

    const result = action(memoized);

    expect(result).toBe(expectedResult);
    expect(memoized.keys()).toHaveLength(expectedRemainingCount);
  });

  it.each([
    {
      description: 'clear all entries',
      setup: (mem: any) => {
        mem(7);
        mem(2);
        mem(9);
      },
      action: (mem: any) => mem.clear(),
      expectedResult: true,
      expectedRemainingCount: 0,
      expectedRemoved: [8, 3, 10]
    },
    {
      description: 'clear specific key',
      setup: (mem: any) => {
        mem(10);
        mem(2);
      },
      action: (mem: any) => {
        const key = mem.getKey(10);

        return mem.clear(key);
      },
      expectedResult: true,
      expectedRemainingCount: 1,
      expectedRemoved: [11]
    }
  ])('should fire onCacheClear callback, $description', ({ setup, action, expectedResult, expectedRemainingCount, expectedRemoved }) => {
    const spy = jest.fn();
    const memoized = memo((val: number) => val + 1, { cacheLimit: 10, onCacheClear: spy });

    setup(memoized);
    const result = action(memoized);

    expect(result).toBe(expectedResult);
    expect(memoized.keys()).toHaveLength(expectedRemainingCount);

    expect(spy).toHaveBeenCalledTimes(1);
    const payload = spy.mock.calls[0][0];

    expect(payload.removed).toEqual(expect.arrayContaining(expectedRemoved));
    expect(payload.removed).toHaveLength(expectedRemoved.length);
    expect(payload.remaining).toHaveLength(expectedRemainingCount);
  });

  it.each([
    {
      description: 'non-existent key',
      setup: (mem: any) => { mem(1); },
      action: (mem: any) => mem.clear('non-existent'),
      expectedResult: false,
      expectedRemainingCount: 1
    }
  ])('should NOT fire onCacheClear callback, $description', ({ setup, action, expectedResult, expectedRemainingCount }) => {
    const spy = jest.fn();
    const memoized = memo((val: number) => val + 1, { cacheLimit: 10, onCacheClear: spy });

    setup(memoized);
    const result = action(memoized);

    expect(result).toBe(expectedResult);
    expect(memoized.keys()).toHaveLength(expectedRemainingCount);
    expect(spy).not.toHaveBeenCalled();
  });

  it('should return consistent structure from keys()', () => {
    const memoized = memo((val: number) => val + 1, { cacheLimit: 10 });

    memoized(1);
    const keys = memoized.keys();

    expect(keys).toHaveLength(1);
    expect(keys[0]).toEqual({
      key: expect.any(String),
      value: 2,
      index: 0
    });
  });

  it('should return key from getKey() when found', () => {
    const memoized = memo((val: number) => val + 1);

    memoized(1);
    const keys = memoized.keys();
    const key = keys[0]?.key;

    expect(memoized.getKey(1)).toBe(key);
    expect(memoized.getKey(2)).toBeUndefined();
  });
});
