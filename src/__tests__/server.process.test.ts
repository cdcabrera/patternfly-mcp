import { spawn } from 'node:child_process';
import { buildIsolationArgs, shutdownChildProcess, resolveEntry } from '../server.process';

jest.mock('node:child_process', () => ({ spawn: jest.fn() }));
jest.mock('node:fs', () => ({ realpathSync: (path: string) => path }));
jest.mock('../logger', () => ({
  log: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  formatUnknownError: (error: unknown) => String(error)
}));

describe('resolveEntry', () => {
  it('should return a pre-resolved entry as-is', () => {
    expect(resolveEntry({ entry: '/abs/host.js' })).toBe('/abs/host.js');
  });

  it('should throw when the specifier cannot be resolved', () => {
    expect(() => resolveEntry({ importSpecifier: '#nope', label: 'Test Host' }))
      .toThrow("Failed to resolve Test Host entry '#nope'.");
  });
});

describe('buildIsolationArgs', () => {
  it.each([
    { description: 'non-strict yields no args', isolation: { mode: 'none' as const }, expectFlag: undefined },
    { description: 'node 22 uses experimental flag', isolation: { mode: 'strict' as const, nodeVersion: 22 }, expectFlag: '--experimental-permission' },
    { description: 'node 24 uses permission flag', isolation: { mode: 'strict' as const, nodeVersion: 24 }, expectFlag: '--permission' }
  ])('$description', ({ isolation, expectFlag }) => {
    const args = buildIsolationArgs('/abs/dir/host.js', isolation);

    if (expectFlag === undefined) {
      expect(args).toEqual([]);
    } else {
      expect(args[0]).toBe(expectFlag);
      expect(args).toContain('--allow-fs-read=/abs/dir');
    }
  });

  it('should include the injected fsReadAllowlist', () => {
    const args = buildIsolationArgs('/abs/dir/host.js', {
      mode: 'strict', nodeVersion: 24, fsReadAllowlist: ['/project']
    });

    expect(args).toContain('--allow-fs-read=/project');
  });
});

describe('shutdownChildProcess', () => {
  const makeChild = () => {
    const listeners: Record<string, Array<(...a: any[]) => void>> = {};

    return {
      killed: false,
      kill: jest.fn(),
      send: jest.fn().mockReturnValue(true),
      once: jest.fn((event: string, handle: any) => (listeners[event] ??= []).push(handle)),
      off: jest.fn(),
      _emit: (event: string) => (listeners[event] || []).forEach(handle => handle())
    } as any;
  };

  it('should resolve immediately when no handle is provided', async () => {
    await expect(shutdownChildProcess(undefined)).resolves.toBeUndefined();
  });

  it('should send shutdown, resolve on exit, and close stderr', async () => {
    const child = makeChild();
    const closeStderr = jest.fn();
    const handle = { child, closeStderr, request: jest.fn() } as any;
    const promise = shutdownChildProcess(handle, { gracePeriodMs: 0 });

    child._emit('exit');

    await promise;

    expect(child.send).toHaveBeenCalledWith(expect.objectContaining({ t: 'shutdown' }));
    expect(closeStderr).toHaveBeenCalledTimes(1);
  });

  it('should force-kill via the primary fallback timer', async () => {
    jest.useFakeTimers();
    const child = makeChild();
    const handle = { child, closeStderr: jest.fn(), request: jest.fn() } as any;
    const promise = shutdownChildProcess(handle, { gracePeriodMs: 0 });

    jest.advanceTimersByTime(1);
    await promise;

    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    jest.useRealTimers();
  });
});

describe('spawnChildProcess stdio', () => {
  it('should spawn with the IPC-capable stdio shape', async () => {
    (spawn as jest.Mock).mockReturnValue({ stderr: { on: jest.fn(), off: jest.fn() } });
    const { spawnChildProcess } = await import('../server.process');

    spawnChildProcess({ entry: '/abs/host.js' });

    expect(spawn).toHaveBeenCalledWith(
      process.execPath,
      ['/abs/host.js'],
      { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] }
    );
  });
});
