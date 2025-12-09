import { spawn, type ChildProcess } from 'node:child_process';
import {
  composeTools,
  getBuiltinTools,
  logWarningsErrors,
  normalizeToolModules,
  sendToolsHostShutdown
} from '../server.tools';
import { log } from '../logger';
import { getOptions, getSessionOptions } from '../options.context';
import { send, awaitIpc, type IpcResponse } from '../server.toolsIpc';
import { DEFAULT_OPTIONS } from '../options.defaults';

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

jest.mock('../options.context', () => ({
  getOptions: jest.fn(),
  getSessionOptions: jest.fn(),
  setOptions: jest.fn(),
  runWithSession: jest.fn(),
  runWithOptions: jest.fn()
}));

jest.mock('../server.toolsIpc', () => {
  const actual = jest.requireActual('../server.toolsIpc');

  return {
    ...actual,
    makeId: jest.fn(() => 'mock-id'),
    send: jest.fn().mockReturnValue(true),
    awaitIpc: jest.fn()
  };
});

jest.mock('node:child_process', () => ({
  spawn: jest.fn()
}));

const MockLog = log as jest.MockedObject<typeof log>;
const MockGetOptions = getOptions as jest.MockedFunction<typeof getOptions>;
const MockGetSessionOptions = getSessionOptions as jest.MockedFunction<typeof getSessionOptions>;
const MockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const MockSend = send as jest.MockedFunction<typeof send>;
const MockAwaitIpc = awaitIpc as jest.MockedFunction<typeof awaitIpc>;

describe('getBuiltinTools', () => {
  it('should return array of built-in tool creators', () => {
    const tools = getBuiltinTools();

    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.every(tool => typeof tool === 'function')).toBe(true);
  });

  it('should return consistent tool creators', () => {
    const tools1 = getBuiltinTools();
    const tools2 = getBuiltinTools();

    expect(tools1.length).toBe(tools2.length);
    expect(tools1).toEqual(tools2);
  });
});

describe('logWarningsErrors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'with warnings only',
      warnings: ['Warning 1', 'Warning 2'],
      errors: [],
      expectedWarnCalls: 1
    },
    {
      description: 'with errors only',
      warnings: [],
      errors: ['Error 1', 'Error 2'],
      expectedWarnCalls: 1
    },
    {
      description: 'with both warnings and errors',
      warnings: ['Warning 1'],
      errors: ['Error 1'],
      expectedWarnCalls: 2
    },
    {
      description: 'with empty arrays',
      warnings: [],
      errors: [],
      expectedWarnCalls: 0
    },
    {
      description: 'with undefined warnings and errors',
      warnings: undefined,
      errors: undefined,
      expectedWarnCalls: 0
    },
    {
      description: 'with single warning',
      warnings: ['Single warning'],
      errors: [],
      expectedWarnCalls: 1
    },
    {
      description: 'with single error',
      warnings: [],
      errors: ['Single error'],
      expectedWarnCalls: 1
    }
  ])('should log warnings and errors, $description', ({ warnings, errors, expectedWarnCalls }) => {
    const options: { warnings?: string[]; errors?: string[] } = {};

    if (warnings !== undefined) {
      options.warnings = warnings;
    }
    if (errors !== undefined) {
      options.errors = errors;
    }
    logWarningsErrors(options);

    expect(MockLog.warn).toHaveBeenCalledTimes(expectedWarnCalls);
    if (warnings && warnings.length > 0) {
      expect(MockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Tools load warnings (${warnings.length})`)
      );
    }
    if (errors && errors.length > 0) {
      expect(MockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Tools load errors (${errors.length})`)
      );
    }
  });

  it('should format warning messages correctly', () => {
    logWarningsErrors({ warnings: ['Warning 1', 'Warning 2'] });

    expect(MockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('Warning 1')
    );
    expect(MockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('Warning 2')
    );
  });

  it('should format error messages correctly', () => {
    logWarningsErrors({ errors: ['Error 1', 'Error 2'] });

    expect(MockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error 1')
    );
    expect(MockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error 2')
    );
  });
});

describe('normalizeToolModules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockGetOptions.mockReturnValue({
      contextPath: '/test/path',
      toolModules: []
    } as any);
  });

  it.each([
    {
      description: 'file: URL',
      toolModules: ['file:///test/module.js'],
      expected: ['file:///test/module.js']
    },
    {
      description: 'http: URL',
      toolModules: ['http://example.com/module.js'],
      expected: ['http://example.com/module.js']
    },
    {
      description: 'https: URL',
      toolModules: ['https://example.com/module.js'],
      expected: ['https://example.com/module.js']
    },
    {
      description: 'data: URL',
      toolModules: ['data:text/javascript,export default {}'],
      expected: ['data:text/javascript,export default {}']
    },
    {
      description: 'node: protocol',
      toolModules: ['node:fs'],
      expected: ['node:fs']
    },
    {
      description: 'relative path starting with ./',
      toolModules: ['./module.js'],
      contextPath: '/test/path',
      expectedPattern: 'file://'
    },
    {
      description: 'relative path starting with ../',
      toolModules: ['../module.js'],
      contextPath: '/test/path',
      expectedPattern: 'file://'
    },
    {
      description: 'absolute path on Unix',
      toolModules: ['/absolute/path/module.js'],
      contextPath: '/test/path',
      expectedPattern: 'file://'
    },
    {
      description: 'absolute path on Windows',
      toolModules: ['C:\\absolute\\path\\module.js'],
      contextPath: '/test/path',
      expectedPattern: 'file://'
    },
    {
      description: 'package name',
      toolModules: ['@scope/package'],
      expected: ['@scope/package']
    },
    {
      description: 'scoped package name',
      toolModules: ['@patternfly/tools'],
      expected: ['@patternfly/tools']
    },
    {
      description: 'empty array',
      toolModules: [],
      expected: []
    }
  ])('should normalize tool modules, $description', ({ toolModules, contextPath, expected, expectedPattern }) => {
    MockGetOptions.mockReturnValue({
      contextPath: contextPath || '/test/path',
      toolModules
    } as any);

    const result = normalizeToolModules();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(toolModules.length);

    if (expected) {
      expect(result).toEqual(expected);
    } else if (expectedPattern) {
      result.forEach(url => {
        expect(url).toMatch(new RegExp(expectedPattern));
      });
    }
  });

  it('should handle multiple mixed module types', () => {
    MockGetOptions.mockReturnValue({
      contextPath: '/test/path',
      toolModules: [
        'file:///absolute/module.js',
        './relative/module.js',
        '@scope/package',
        'https://example.com/module.js'
      ]
    } as any);

    const result = normalizeToolModules();

    expect(result.length).toBe(4);
    expect(result[0]).toBe('file:///absolute/module.js');
    expect(result[1]).toMatch(/^file:\/\//);
    expect(result[2]).toBe('@scope/package');
    expect(result[3]).toBe('https://example.com/module.js');
  });
});

describe('sendToolsHostShutdown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    MockGetOptions.mockReturnValue({
      pluginHost: DEFAULT_OPTIONS.pluginHost
    } as any);

    MockGetSessionOptions.mockReturnValue({
      sessionId: 'test-session-id',
      channelName: 'test-channel'
    } as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    {
      description: 'with default grace period',
      pluginHost: {},
      expectedGracePeriod: 0
    },
    {
      description: 'with custom grace period',
      pluginHost: { gracePeriodMs: 1000 },
      expectedGracePeriod: 1000
    },
    {
      description: 'with zero grace period',
      pluginHost: { gracePeriodMs: 0 },
      expectedGracePeriod: 0
    }
  ])('should shutdown tools host, $description', async ({ pluginHost }) => {
    MockGetOptions.mockReturnValue({
      pluginHost: { ...DEFAULT_OPTIONS.pluginHost, ...pluginHost }
    } as any);

    // Since we can't directly access activeHostsBySession, we'll test
    // that the function handles the case when no host exists
    await sendToolsHostShutdown();

    // Should not throw when no host exists
    expect(MockSend).not.toHaveBeenCalled();
  });

  it('should not throw when no active host exists', async () => {
    await expect(sendToolsHostShutdown()).resolves.not.toThrow();
  });
});

describe('composeTools', () => {
  let mockChild: ChildProcess & {
    kill: jest.Mock;
    killed: boolean;
    on: jest.Mock;
    once: jest.Mock;
    off: jest.Mock;
    send: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockChild = {
      kill: jest.fn(),
      killed: false,
      on: jest.fn(),
      once: jest.fn(),
      off: jest.fn(),
      send: jest.fn().mockReturnValue(true),
      pid: 123,
      connected: true,
      disconnect: jest.fn(),
      exitCode: null,
      signalCode: null,
      channel: null,
      stdin: null,
      stdout: null,
      stderr: null,
      stdio: [],
      spawnfile: '',
      spawnargs: []
    } as any;

    MockSpawn.mockReturnValue(mockChild as any);

    MockGetOptions.mockReturnValue({
      toolModules: [],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost,
      pluginIsolation: undefined
    } as any);

    MockGetSessionOptions.mockReturnValue({
      sessionId: 'test-session-id',
      channelName: 'test-channel'
    } as any);

    // Mock IPC responses - check the actual message type
    MockAwaitIpc.mockImplementation(async (child: any, matcher: any): Promise<IpcResponse> => {
      // Test the matcher with a sample message to determine type
      const testHello: IpcResponse = { t: 'hello:ack', id: 'mock-id' };
      const testLoad: IpcResponse = { t: 'load:ack', id: 'mock-id', warnings: [], errors: [] };
      const testManifest: IpcResponse = { t: 'manifest:result', id: 'mock-id', tools: [] };

      if (matcher(testHello)) {
        return testHello;
      }
      if (matcher(testLoad)) {
        return testLoad;
      }
      if (matcher(testManifest)) {
        return {
          t: 'manifest:result',
          id: 'mock-id',
          tools: [
            {
              id: 'tool-1',
              name: 'Tool1',
              description: 'Tool 1',
              inputSchema: {}
            }
          ]
        } as IpcResponse;
      }
      throw new Error('Unexpected matcher');
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each([
    {
      description: 'with empty toolModules',
      toolModules: [],
      expectedBuiltinOnly: true
    },
    {
      description: 'with undefined toolModules',
      toolModules: undefined,
      expectedBuiltinOnly: true
    },
    {
      description: 'with null toolModules',
      toolModules: null,
      expectedBuiltinOnly: true
    }
  ])('should return only built-in tools, $description', async ({ toolModules }) => {
    MockGetOptions.mockReturnValue({
      toolModules,
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost
    } as any);

    const result = await composeTools();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(MockSpawn).not.toHaveBeenCalled();
  });

  it.each([
    {
      description: 'Node 20',
      nodeVersion: 20,
      toolModules: ['./module.js']
    },
    {
      description: 'Node 21',
      nodeVersion: 21,
      toolModules: ['./module.js']
    },
    {
      description: 'Node 18',
      nodeVersion: 18,
      toolModules: ['./module.js']
    }
  ])('should skip externals and warn when Node < 22, $description', async ({ nodeVersion, toolModules }) => {
    MockGetOptions.mockReturnValue({
      toolModules,
      nodeVersion,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost
    } as any);

    const result = await composeTools();

    expect(Array.isArray(result)).toBe(true);
    expect(MockLog.warn).toHaveBeenCalledWith(
      'External tool plugins require Node >= 22; skipping externals and continuing with built-ins.'
    );
    expect(MockSpawn).not.toHaveBeenCalled();
  });

  it('should spawn tools host and return built-in + proxy creators', async () => {
    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost,
      pluginIsolation: undefined
    } as any);

    const result = await composeTools();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(MockSpawn).toHaveBeenCalled();
    expect(MockSend).toHaveBeenCalled();
    expect(MockAwaitIpc).toHaveBeenCalled();
  });

  it('should handle spawn errors gracefully', async () => {
    MockSpawn.mockImplementation(() => {
      throw new Error('Spawn failed');
    });

    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost
    } as any);

    const result = await composeTools();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(MockLog.warn).toHaveBeenCalledWith(
      'Failed to start Tools Host; skipping externals and continuing with built-ins.'
    );
  });

  it('should handle IPC errors gracefully', async () => {
    MockAwaitIpc.mockRejectedValue(new Error('IPC timeout'));

    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost
    } as any);

    const result = await composeTools();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(MockLog.warn).toHaveBeenCalledWith(
      'Failed to start Tools Host; skipping externals and continuing with built-ins.'
    );
  });

  it('should use strict isolation when pluginIsolation is strict', async () => {
    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost,
      pluginIsolation: 'strict'
    } as any);

    await composeTools();

    expect(MockSpawn).toHaveBeenCalled();
    const spawnCall = MockSpawn.mock.calls[0];

    expect(spawnCall).toBeDefined();
    const nodeArgs = spawnCall![1];

    expect(nodeArgs).toContain('--experimental-permission');
    expect(nodeArgs.some((arg: string) => arg.startsWith('--allow-fs-read='))).toBe(true);
  });

  it('should send hello, load, and manifest requests', async () => {
    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost
    } as any);

    await composeTools();

    expect(MockSend).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ t: 'hello' })
    );
    expect(MockSend).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ t: 'load' })
    );
    expect(MockSend).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ t: 'manifest:get' })
    );
  });

  it('should log warnings and errors from load', async () => {
    MockAwaitIpc.mockImplementation(async (child: any, matcher: any): Promise<IpcResponse> => {
      const testHello: IpcResponse = { t: 'hello:ack', id: 'mock-id' };
      const testLoad: IpcResponse = {
        t: 'load:ack',
        id: 'mock-id',
        warnings: ['Warning 1', 'Warning 2'],
        errors: ['Error 1']
      };
      const testManifest: IpcResponse = { t: 'manifest:result', id: 'mock-id', tools: [] };

      if (matcher(testHello)) {
        return testHello;
      }
      if (matcher(testLoad)) {
        return testLoad;
      }
      if (matcher(testManifest)) {
        return testManifest;
      }
      throw new Error('Unexpected matcher');
    });

    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost
    } as any);

    await composeTools();

    expect(MockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('Tools load warnings (2)')
    );
    expect(MockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining('Tools load errors (1)')
    );
  });

  it('should clean up host on child exit', async () => {
    MockGetOptions.mockReturnValue({
      toolModules: ['./test-module.js'],
      nodeVersion: 22,
      contextPath: '/test/path',
      contextUrl: 'file:///test/path',
      pluginHost: DEFAULT_OPTIONS.pluginHost
    } as any);

    // Reset mocks to track calls in this test
    mockChild.once.mockClear();

    await composeTools();

    // The cleanup handlers should be registered
    expect(mockChild.once).toHaveBeenCalled();
    const exitCall = mockChild.once.mock.calls.find((call: any[]) => call[0] === 'exit');
    const disconnectCall = mockChild.once.mock.calls.find((call: any[]) => call[0] === 'disconnect');

    expect(exitCall).toBeDefined();
    expect(disconnectCall).toBeDefined();
  });
});
