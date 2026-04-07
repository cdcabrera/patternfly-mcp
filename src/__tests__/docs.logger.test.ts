import diagnostics_channel from 'node:diagnostics_channel';
import { setOptions } from '../options.context';
import { createDocsLogger } from '../docs.logger';
import { log } from '../logger';

describe('createDocsLogger', () => {
  let subscribeSpy: jest.SpyInstance;
  let unsubscribeSpy: jest.SpyInstance;

  beforeEach(() => {
    setOptions({});
    subscribeSpy = jest.spyOn(diagnostics_channel, 'subscribe');
    unsubscribeSpy = jest.spyOn(diagnostics_channel, 'unsubscribe');
  });

  afterEach(() => {
    subscribeSpy.mockRestore();
    unsubscribeSpy.mockRestore();
  });

  it.each([
    {
      description: 'with default options',
      options: { channelName: 'docsChannel', stderr: true }
    },
    {
      description: 'with no channel name',
      options: { channelName: '' }
    }
  ])('should attempt to subscribe and unsubscribe from a channel, $description', ({ options }) => {
    const { unsubscribe } = createDocsLogger(options as any);

    unsubscribe();

    if (options.channelName) {
      expect(subscribeSpy).toHaveBeenCalled();
      expect(unsubscribeSpy).toHaveBeenCalled();
    } else {
      expect(subscribeSpy).not.toHaveBeenCalled();
      expect(unsubscribeSpy).not.toHaveBeenCalled();
    }
  });

  it('should return a memoized docs logger that avoids duplicate sinks; teardown stops emissions', () => {
    setOptions({ logging: { stderr: true, level: 'debug' } as any });

    const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true as any);

    // Create a single memoized docs logger with two subscription handlers
    const { subscribe: subscribeCallOne, unsubscribe: unsubscribeAllCallOne } = createDocsLogger.memo();
    const { subscribe: subscribeCallTwo, unsubscribe: unsubscribeAllCallTwo } = createDocsLogger.memo();

    // Create two lower-level subscription handlers
    const mockHandlerOne = jest.fn();
    const mockHandlerTwo = jest.fn();
    const unsubscribeMockHandlerOne = subscribeCallOne(mockHandlerOne);

    subscribeCallTwo(mockHandlerTwo);
    // const unsubscribeMockHandlerTwo = ;

    log.debug('docs a');

    expect(mockHandlerOne).toHaveBeenCalledTimes(1);
    expect(mockHandlerTwo).toHaveBeenCalledTimes(1);

    // This removes the subscription for mockHandlerOne
    unsubscribeMockHandlerOne();

    log.debug('docs b');

    expect(mockHandlerOne).toHaveBeenCalledTimes(1);
    expect(mockHandlerTwo).toHaveBeenCalledTimes(2);

    log.info('docs c');
    log.info('docs d');

    expect(unsubscribeAllCallOne).toBe(unsubscribeAllCallTwo);

    // This removes all subscriptions
    unsubscribeAllCallOne();

    log.debug('docs e');

    expect(mockHandlerOne).toHaveBeenCalledTimes(1);
    expect(mockHandlerTwo).toHaveBeenCalledTimes(4);

    stderrSpy.mockRestore();
  });
});
