// 1. Set up mocks for worker_threads before any imports
let mockWorkerData: any = {
  moduleSpecifier: '' // Starts with safe empty values so the initial import run is caught gracefully
};

const mockParentPort = {
  postMessage: jest.fn()
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

// Import runWorker (this will trigger the initial runWorker() call)
import { runWorker } from '../server.workerEntry';

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
    export default function(options) {
      const callback = (args) => {
        return { success: true, processed: args.test };
      };
      return ['my-collection', callback, { isRequired: true }];
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
    expect(process.exit).toHaveBeenCalledWith(0);
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
    expect(process.exit).toHaveBeenCalledWith(0);
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

  it('should run and resolve collections tuple format callback', async () => {
    mockWorkerData = {
      moduleSpecifier: creatorDataUri,
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
