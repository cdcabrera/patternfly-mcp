import { crawl } from '../records.spider';

describe('records.spider', () => {
  it('should crawl in FIFO order and respect cycle guard', async () => {
    const visitedUrls: string[] = [];
    const fetchRaw = jest.fn().mockImplementation(async url => {
      visitedUrls.push(url);

      if (url === 'root') {
        return { status: 200, body: JSON.stringify(['child1', 'child2']) };
      }

      return { status: 200, body: 'leaf' };
    });

    const step = jest.fn().mockImplementation(async (emit, control) => {
      try {
        const children = JSON.parse(emit.body);

        if (Array.isArray(children)) {
          children.forEach(child => control.enqueue(child));
        }
      } catch {
        // Not JSON, leaf node
      }
    });

    await crawl(['root'], step, { fetchRaw });

    expect(visitedUrls).toEqual(['root', 'child1', 'child2']);
    expect(step).toHaveBeenCalledTimes(3);
  });

  it('should respect maxRequests backstop', async () => {
    const fetchRaw = jest.fn().mockResolvedValue({ status: 200, body: 'content' });
    const step = jest.fn().mockImplementation((emit, control) => {
      control.enqueue(`${emit.url}/next`);
    });

    const results = await crawl(['1'], step, { fetchRaw, maxRequests: 3 });

    expect(results).toHaveLength(3);
    expect(fetchRaw).toHaveBeenCalledTimes(3);
  });

  it('should skip soft-404s', async () => {
    const fetchRaw = jest.fn().mockImplementation(async url => {
      if (url === '404') {
        return null;
      }

      return { status: 200, body: 'ok' };
    });
    const step = jest.fn();

    const results = await crawl(['ok', '404'], step, { fetchRaw });

    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe('ok');
    expect(step).toHaveBeenCalledTimes(1);
  });

  it('should respect AbortSignal', async () => {
    const controller = new AbortController();
    const fetchRaw = jest.fn().mockImplementation(async () => {
      controller.abort();

      return { status: 200, body: 'ok' };
    });
    const step = jest.fn();

    const results = await crawl(['1', '2'], step, { fetchRaw, signal: controller.signal });

    expect(results).toHaveLength(1);
    expect(fetchRaw).toHaveBeenCalledTimes(1);
  });
});
