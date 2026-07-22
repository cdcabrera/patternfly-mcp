import { spawn } from 'node:child_process';
import { spawnProcess, debugChildStderr } from '../server.process';
import { log } from '../logger';

jest.mock('node:child_process', () => ({
  spawn: jest.fn()
}));
jest.mock('../logger', () => ({
  log: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

describe('spawnProcess', () => {
  const MockSpawn = jest.mocked(spawn);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should call spawn with correct arguments', () => {
    spawnProcess({
      nodeArgs: ['--flag'],
      entryPath: 'script.js',
      processName: 'test',
      sessionId: 'sid'
    });

    expect(MockSpawn).toHaveBeenCalledWith(
      process.execPath,
      ['--flag', 'script.js'],
      expect.objectContaining({ stdio: expect.arrayContaining(['ipc']) })
    );
  });
});

describe('debugChildStderr', () => {
  const MockLog = jest.mocked(log);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should log stderr output', () => {
    const mockStderr = {
      on: jest.fn(),
      off: jest.fn()
    };
    const mockChild = {
      pid: 123,
      stderr: mockStderr
    } as any;

    const cleanup = debugChildStderr(mockChild, { processName: 'test', sessionId: 'sid' });

    const onData = mockStderr.on.mock.calls.find((call: any[]) => call[0] === 'data')[1];

    onData(Buffer.from('hello\nworld'));

    expect(MockLog.debug).toHaveBeenCalledWith('[test pid=123 sid=sid] hello');
    expect(MockLog.debug).toHaveBeenCalledWith('[test pid=123 sid=sid] world');

    cleanup();
    expect(mockStderr.off).toHaveBeenCalledWith('data', onData);
  });
});
