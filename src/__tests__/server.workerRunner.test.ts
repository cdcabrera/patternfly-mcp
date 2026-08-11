import { keepWorkerAlive, runWorker } from '../server.workerRunner';

// 1. Set up mocks for worker_threads before any imports
let mockWorkerData: any = {
  moduleSpecifier: '' // Starts with safe empty values so the initial import run is caught gracefully
};

const mockParentPort = {
  postMessage: jest.fn(),
  // `runWorker` Route A pins the port via `.ref()` for the task lifetime and
  // releases it via `.unref()` in `.finally()` (keeps the worker's event loop
  // alive when only unref'd handles are pending — see server.workerRunner.ts).
  ref: jest.fn(),
  unref: jest.fn()
};

jest.mock('node:worker_threads', () => ({
  get workerData() {
    return mockWorkerData;
  },
  get parentPort() {
    return mockParentPort;
  }
}));

// Mock options.context to intercept runWithOptions and runWithSession
jest.mock('../options.context', () => {
  const actual = jest.requireActual('../options.context');

  return {
    ...actual,
    runWithOptions: jest.fn().mockImplementation((opts, fn) => {
      (global as any).lastWithOptions = opts;

      return actual.runWithOptions(opts, fn);
    }),
    runWithSession: jest.fn().mockImplementation((sess, fn) => {
      (global as any).lastWithSession = sess;

      return actual.runWithSession(sess, fn);
    })
  };
});

// 2. Mock process.exit to prevent the test runner from terminating
const originalExit = process.exit;

// @ts-ignore
process.exit = jest.fn();

// Mock the Function constructor to intercept dynamic import() under Jest
const originalFunction = global.Function;

// @ts-ignore
global.Function = function mockFunctionConstructor(...args: string[]) {
  if (args[args.length - 1] === 'return import(spec)') {
    return async (spec: string) => {
      if (spec.startsWith('data:')) {
        const base64 = spec.split('base64,')[1] || '';
        const code = Buffer.from(base64, 'base64').toString('utf-8');

        let compiled = code;

        compiled = compiled.replace(/export default\s+function\s*([^(]*)/, 'global.currentModule.default = function $1');
        compiled = compiled.replace(/export default\s+([^\n;]+)/, 'global.currentModule.default = $1');
        compiled = compiled.replace(/export function\s+([a-zA-Z0-9_$]+)/g, 'global.currentModule.$1 = function');

        (global as any).currentModule = {};

        const fn = new originalFunction(compiled);

        fn();

        const mod = (global as any).currentModule;

        delete (global as any).currentModule;

        return mod;
      }

      return {};
    };
  }

  return originalFunction.apply(this, args as any);
};

afterAll(() => {
  process.exit = originalExit;
  global.Function = originalFunction;
});

describe('workerEntry', () => {
  const originalResolve = import.meta.resolve;

  beforeAll(() => {
    // Mock import.meta.resolve if possible
    try {
      (import.meta as any).resolve = jest.fn().mockImplementation((spec: string) => {
        if (spec === '#collectionPatternFlyApi') {
          return 'file:///mock/path/collection.patternFlyApi.js';
        }

        return spec;
      });
    } catch {
      // Ignored if immutable
    }
  });

  afterAll(() => {
    try {
      (import.meta as any).resolve = originalResolve;
    } catch {
      // Ignored
    }
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockParentPort.postMessage.mockClear();
    // @ts-ignore
    process.exit.mockClear();
    delete (global as any).lastWithOptions;
    delete (global as any).lastWithSession;
  });

  const validCode = `
    export default function(args) {
      return args && args.test;
    }
  `;
  const validDataUri = `data:text/javascript;base64,${Buffer.from(validCode).toString('base64')}`;

  const validNamedCode = `
    export function myExport(args) {
      return args && args.val ? args.val * 2 : 0;
    }
  `;
  const validNamedDataUri = `data:text/javascript;base64,${Buffer.from(validNamedCode).toString('base64')}`;

  const creatorCode = `
    export function runCollection(args) {
      return { success: true, processed: args.test };
    }
  `;
  const creatorDataUri = `data:text/javascript;base64,${Buffer.from(creatorCode).toString('base64')}`;

  it('should fail if moduleSpecifier is missing', async () => {
    mockWorkerData = {};
    await runWorker();

    expect(mockParentPort.postMessage).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({
        message: 'No moduleSpecifier specified for worker task.'
      })
    });
  });

  it('should dynamically import and run default callback', async () => {
    mockWorkerData = {
      moduleSpecifier: validDataUri,
      args: { test: true }
    };

    await runWorker();

    expect(mockParentPort.postMessage).toHaveBeenCalledWith({
      success: true,
      payload: true
    });
  });

  it('should dynamically import and run named callback', async () => {
    mockWorkerData = {
      moduleSpecifier: validNamedDataUri,
      exportName: 'myExport',
      args: { val: 5 }
    };

    await runWorker();

    expect(mockParentPort.postMessage).toHaveBeenCalledWith({
      success: true,
      payload: 10
    });
  });

  it('should run and resolve collections via runCollection function', async () => {
    mockWorkerData = {
      moduleSpecifier: creatorDataUri,
      exportName: 'runCollection',
      args: { test: 'hello' }
    };

    await runWorker();

    expect(mockParentPort.postMessage).toHaveBeenCalledWith({
      success: true,
      payload: { success: true, processed: 'hello' }
    });
  });

  it('should fail if callback is not a function', async () => {
    const invalidCode = `
      export default "not-a-function";
    `;
    const invalidDataUri = `data:text/javascript;base64,${Buffer.from(invalidCode).toString('base64')}`;

    mockWorkerData = {
      moduleSpecifier: invalidDataUri
    };

    await runWorker();

    expect(mockParentPort.postMessage).toHaveBeenCalledWith({
      success: false,
      error: expect.objectContaining({
        message: expect.stringContaining('must be a function')
      })
    });
  });

  it('should correctly handle options and session re-hydration contexts', async () => {
    const mockOptions = { someOption: 'test-value' };
    const mockSession = { someSession: 'session-value' };

    mockWorkerData = {
      moduleSpecifier: validDataUri,
      args: { test: true },
      options: mockOptions,
      session: mockSession
    };

    await runWorker();

    expect(mockParentPort.postMessage).toHaveBeenCalledWith({
      success: true,
      payload: true
    });

    expect((global as any).lastWithOptions).toEqual(mockOptions);
    expect((global as any).lastWithSession).toEqual(mockSession);
  });
});

describe('keepWorkerAlive', () => {
  // Snapshot the original `ref` so tests that exercise the fallback branch can
  // temporarily remove it from the mocked `parentPort` and restore afterwards.
  const originalRef = mockParentPort.ref;

  beforeEach(() => {
    jest.clearAllMocks();
    // Restore the port's `ref` before every case in case a prior test deleted it.
    (mockParentPort as any).ref = originalRef;
  });

  afterAll(() => {
    (mockParentPort as any).ref = originalRef;
  });

  it('should pin parentPort via ref() and return an unref() cleanup', () => {
    const release = keepWorkerAlive();

    expect(mockParentPort.ref).toHaveBeenCalledTimes(1);
    expect(mockParentPort.unref).not.toHaveBeenCalled();

    release();

    expect(mockParentPort.unref).toHaveBeenCalledTimes(1);
  });

  it('should throw by default when parentPort.ref is not a function', () => {
    (mockParentPort as any).ref = undefined;

    expect(() => keepWorkerAlive()).toThrow('parentPort.ref is not a function');
  });

  describe('fallback branch (throwOnParentPortError: false)', () => {
    // The production fallback intentionally does NOT `.unref()` its ~24.8-day
    // timer (that's the whole point — the timer IS the keep-alive anchor). If
    // a real one were ever scheduled here, it would keep the Jest process
    // alive practically forever. So we directly replace `global.setTimeout` /
    // `global.clearTimeout` on the global object (jest.spyOn doesn't reliably
    // intercept the runner's `setTimeout` binding under this ESM/ts-jest
    // config) and record only the calls that go through our patched globals.
    const fakeTimerHandle = Symbol('fakeTimerHandle') as unknown as NodeJS.Timeout;
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    let scheduledCalls: unknown[][];
    let clearedHandles: unknown[];

    beforeEach(() => {
      (mockParentPort as any).ref = undefined;
      scheduledCalls = [];
      clearedHandles = [];
      (global as any).setTimeout = (...args: unknown[]) => {
        scheduledCalls.push(args);

        return fakeTimerHandle;
      };
      (global as any).clearTimeout = (handle: unknown) => {
        clearedHandles.push(handle);
      };
    });

    afterEach(() => {
      (global as any).setTimeout = originalSetTimeout;
      (global as any).clearTimeout = originalClearTimeout;
    });

    it('should fall back to a setTimeout and clear it on release', () => {
      const release = keepWorkerAlive({ throwOnParentPortError: false });

      expect(scheduledCalls).toHaveLength(1);
      // Default fallback duration is the max 32-bit signed int (~24.8 days).
      expect(typeof scheduledCalls[0]?.[0]).toBe('function');
      expect(scheduledCalls[0]?.[1]).toBe(86_400_000);
      expect(mockParentPort.unref).not.toHaveBeenCalled();

      release();

      expect(clearedHandles).toEqual([fakeTimerHandle]);
      // Cleanup must NOT touch the port — it was never pinned in this branch.
      expect(mockParentPort.unref).not.toHaveBeenCalled();
    });

    it('should honor a custom timeoutMs on the fallback timer', () => {
      const release = keepWorkerAlive({ throwOnParentPortError: false, timeoutMs: 12_345 });

      expect(scheduledCalls).toHaveLength(1);
      expect(scheduledCalls[0]?.[1]).toBe(12_345);

      release();
    });
  });
});
