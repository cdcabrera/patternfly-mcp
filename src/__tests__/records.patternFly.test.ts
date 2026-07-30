import * as serverProcess from '../server.process';
import { spawnApiHost, type HostHandle } from '../records.patternFly';

jest.mock('../server.process', () => ({
  spawnChildProcess: jest.fn(),
  shutdownChildProcess: jest.fn(),
  activeChildrenBySession: new Map()
}));

jest.mock('../logger', () => ({
  log: { warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  formatUnknownError: jest.fn(err => String(err))
}));

describe('records.patternFly', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('spawnApiHost should spawn child process with correct specifier', async () => {
    const mockRequest = jest.fn();

    (mockRequest as any).mockResolvedValueOnce({ t: 'hello:ack' }); // hello
    (mockRequest as any).mockResolvedValueOnce({ t: 'load:ack', warnings: [], errors: [] }); // load
    (mockRequest as any).mockResolvedValueOnce({ t: 'manifest:result', tools: [{ name: 'crawl' }] }); // manifest

    const mockHandle = {
      child: {} as any,
      closeStderr: jest.fn(),
      request: mockRequest,
      manifest: [{ name: 'crawl' }]
    } as unknown as HostHandle;

    (serverProcess.spawnChildProcess as jest.Mock).mockReturnValue(mockHandle);

    const handle = await spawnApiHost();

    expect(serverProcess.spawnChildProcess).toHaveBeenCalledWith(expect.objectContaining({
      importSpecifier: '#patternFlyHost',
      label: 'PatternFly API Host'
    }));
    expect(handle.manifest).toEqual([{ name: 'crawl' }]);
  });
});
