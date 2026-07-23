import { spawn } from 'node:child_process';
import { spawnProcess, debugChildStderr, bootstrapChild } from '../server.process';
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

describe('bootstrapChild', () => {
  let originalSend: any;
  let originalOn: any;
  let originalOff: any;

  beforeEach(() => {
    originalSend = process.send;
    originalOn = process.on;
    originalOff = process.off;
    process.on = jest.fn() as any;
    process.off = jest.fn() as any;
  });

  afterEach(() => {
    process.send = originalSend;
    process.on = originalOn;
    process.off = originalOff;
  });

  it('should not register listener if process.send is missing', () => {
    // @ts-ignore
    delete process.send;
    bootstrapChild(jest.fn());
    expect(process.on).not.toHaveBeenCalled();
  });

  it('should register listener if process.send is present', () => {
    // @ts-ignore
    process.send = jest.fn();
    bootstrapChild(jest.fn());
    expect(process.on).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('should call router and detach listener on first message', () => {
    // @ts-ignore
    process.send = jest.fn();
    const mockRouter = jest.fn();

    bootstrapChild(mockRouter);

    const onMessage = (process.on as jest.Mock).mock.calls[0][1];
    const testMessage = { foo: 'bar' };

    onMessage(testMessage);

    expect(mockRouter).toHaveBeenCalledWith(testMessage);
    expect(process.off).toHaveBeenCalledWith('message', onMessage);
  });
});
