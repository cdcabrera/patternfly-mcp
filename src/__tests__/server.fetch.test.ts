import { ReadableStream } from 'node:stream/web';
import { setFetch, FetchError, type FetchState } from '../server.fetch';
import { getOptions } from '../options.context';

describe('setFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('should initialize in idle phase', () => {
    const { status } = setFetch();

    expect(status() as FetchState).toEqual({
      phase: 'idle',
      progress: 0,
      bytesReceived: 0
    });
  });

  it('should fetch and parse text correctly', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => {
          if (name === 'content-length') {
            return '11';
          }

          if (name === 'content-type') {
            return 'text/plain';
          }

          return null;
        }
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello '));
          controller.enqueue(new TextEncoder().encode('world'));
          controller.close();
        }
      })
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { get, status } = setFetch();
    const result = await get('https://example.com');

    expect(result).toEqual({
      type: 'text',
      status: 200,
      statusText: 'OK',
      data: 'hello world'
    });

    expect(status() as FetchState).toEqual({
      phase: 'success',
      progress: 100,
      bytesReceived: 11,
      type: 'text',
      data: 'hello world'
    });
  });

  it('should fetch and parse JSON correctly', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => {
          if (name === 'content-type') {
            return 'application/json';
          }

          return null;
        }
      },
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"foo": "bar"}'));
          controller.close();
        }
      })
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { get } = setFetch();
    const result = await get('https://example.com/data.json');

    expect(result.type).toBe('json');
    expect(result.data).toEqual({ foo: 'bar' });
  });

  it('should reject with FetchError on non-ok response', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: {
        get: () => null
      }
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { get, status } = setFetch();

    await expect(get('https://example.com/404')).rejects.toThrow(FetchError);

    try {
      await get('https://example.com/404');
    } catch (error) {
      expect(error).toBeInstanceOf(FetchError);
      const fe = error as FetchError;

      expect(fe.status).toBe(404);
      expect(fe.statusText).toBe('Not Found');
    }

    expect((status() as FetchState).phase).toBe('error');
    expect((status() as FetchState).error).toBeInstanceOf(FetchError);
  });

  it('should check content-length against maxSizeBytes', async () => {
    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: (name: string) => (name === 'content-length' ? '1000' : null)
      }
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const options = {
      ...getOptions(),
      xhrFetch: { allowBinary: false, maxSizeBytes: 500, timeoutMs: 1000, preflightHead: false }
    };

    const { get, status } = setFetch(options as any);

    await expect(get('https://example.com')).rejects.toThrow('File blocked: exceeds 500 bytes.');
    expect((status() as FetchState).phase).toBe('error');
  });

  it('should handle cancel properly', async () => {
    let rejectPull: (reason: any) => void = () => {};
    const mockCancel = jest.fn();

    const stream = new ReadableStream({
      pull() {
        return new Promise((_, reject) => {
          rejectPull = reject;
        });
      },
      cancel(reason) {
        mockCancel(reason);
        rejectPull(reason);
      }
    });

    const mockResponse = {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {
        get: () => null
      },
      body: stream
    };

    (global.fetch as jest.Mock).mockResolvedValue(mockResponse);

    const { get, cancel, status } = setFetch();
    const promise = get('https://example.com');

    // Wait for the fetch to start and hit the reader
    await new Promise(resolve => setTimeout(resolve, 10));

    expect((status() as FetchState).phase).toBe('loading');

    cancel();

    await expect(promise).rejects.toMatchObject({ cancelled: true });
    expect((status() as FetchState).phase).toBe('cancelled');
    expect(mockCancel).toHaveBeenCalled();
  });

  it('should handle timeout', async () => {
    jest.useFakeTimers();

    (global.fetch as jest.Mock).mockImplementation((_url, init) => new Promise((_, reject) => {
      if (init?.signal) {
        init.signal.addEventListener('abort', () => {
          reject(init.signal.reason);
        });
      }
    }));

    const options = {
      ...getOptions(),
      xhrFetch: { allowBinary: false, maxSizeBytes: 0, timeoutMs: 100, preflightHead: false }
    };

    const { get, status } = setFetch(options as any);
    const promise = get('https://example.com');

    jest.advanceTimersByTime(150);

    await expect(promise).rejects.toThrow(/Timeout/);
    expect((status() as FetchState).phase).toBe('error');

    jest.useRealTimers();
  });
});
