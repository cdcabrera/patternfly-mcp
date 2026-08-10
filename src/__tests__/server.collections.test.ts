import { composeCollections, sendCollectionsHostShutdown } from '../server.collections';
import { getOptions, getSessionOptions } from '../options.context';
import { shutdownChildProcess, activeChildrenBySession } from '../server.process';

jest.mock('../server.process', () => ({
  spawnChildProcess: jest.fn(),
  shutdownChildProcess: jest.fn().mockResolvedValue(undefined),
  activeChildrenBySession: new Map()
}));

jest.mock('../options.context', () => ({
  getOptions: jest.fn(() => ({})),
  getSessionOptions: jest.fn(() => ({ sessionId: 'test' })),
  getLoggerOptions: jest.fn(() => ({}))
}));

describe('composeCollections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should wrap builtin creators and set _isInternal: true', async () => {
    const mockHandler = jest.fn();
    const mockCreator: any = jest.fn(() => ['test-collection', mockHandler, { isRequired: true }]);

    const builtinCreators = [mockCreator];
    const result: any = await composeCollections(builtinCreators);

    expect(result.length).toBe(1);

    const [name, callback, config] = result[0]({});

    expect(name).toBe('test-collection');
    expect(config?._isInternal).toBe(true);
    expect(config?.isRequired).toBe(true);
    expect(callback).toBe(mockHandler);
  });

  it('should return an empty array when no creators are provided', async () => {
    const result = await composeCollections([]);

    expect(result).toEqual([]);
  });

  it.each([
    {
      description: 'with custom options',
      options: { some: 'option' },
      session: { sessionId: '123' }
    }
  ])('should handle various configurations, $description', async ({ options, session }) => {
    (getOptions as jest.Mock).mockReturnValue(options);
    (getSessionOptions as jest.Mock).mockReturnValue(session);

    const mockCreator: any = jest.fn(() => ['test', jest.fn()]);
    const result: any = await composeCollections([mockCreator], options as any, session as any);

    expect(result.length).toBe(1);
    expect(result[0]()).toContain('test');
  });

  it('should match snapshot for composed collection creators', async () => {
    const mockCreator: any = jest.fn(() => ['snap-collection', jest.fn(), { isRequired: false }]);
    const result: any = await composeCollections([mockCreator]);

    const output = result.map((collection: any) => {
      const [name, , config] = collection();

      return { name, config };
    });

    expect(output).toMatchSnapshot();
  });
});

describe('sendCollectionsHostShutdown', () => {
  const MockShutdownChildProcess = jest.mocked(shutdownChildProcess);

  beforeEach(() => {
    jest.clearAllMocks();
    activeChildrenBySession.clear();
  });

  it('should attempt graceful shutdown of child', async () => {
    const child = { pid: 123 };
    const handle = { child, closeStderr: jest.fn() };
    const sessionId = 'test-session-id';
    const registryKey = `${sessionId}:collections`;

    activeChildrenBySession.set(registryKey, handle as any);

    await sendCollectionsHostShutdown({ pluginHost: { gracePeriodMs: 10 } } as any, { sessionId } as any);

    expect(MockShutdownChildProcess).toHaveBeenCalledTimes(1);
    expect(MockShutdownChildProcess).toHaveBeenCalledWith(handle, {
      gracePeriodMs: 10,
      sessionId: registryKey,
      label: 'Collections Host'
    });
  });
});
