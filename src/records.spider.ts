import { loadFileFetch } from './server.getResources';
import { getOptions } from './options.context';

interface CrawlEmit {
  url: string;
  status: number;
  body: string;
  semanticContext: {
    version?: string;
    section?: string;
    item?: string;
    facet?: string;
  };
}

interface CrawlControl {
  enqueue: (url: string) => void;
}

type CrawlStep = (emit: CrawlEmit, control: CrawlControl) => void | Promise<void>;

interface CrawlOptions {
  fetchRaw?: (url: string, init?: { signal?: AbortSignal }) => Promise<{ status: number; body: unknown } | null>;
  visited?: Set<string>;
  maxRequests?: number;
  signal?: AbortSignal;
}

/**
 * Generic in-memory spider engine
 *
 * @param seeds - Starting URLs
 * @param step - Crawl step function
 * @param options - Options
 * @returns List of emitted results
 */
async function crawl(
  seeds: string[],
  step: CrawlStep,
  options: CrawlOptions = {}
): Promise<CrawlEmit[]> {
  const {
    fetchRaw = async (url, init) => {
      // Default to loadFileFetch which handles timeout, retry, and soft-404
      const res = await loadFileFetch(url, { ...getOptions(), signal: init?.signal } as any);

      if (res.content === null) {
        return null;
      }

      return { status: 200, body: res.content };
    },
    visited = new Set<string>(),
    maxRequests = 500,
    signal
  } = options;

  const queue: string[] = [...seeds];
  const emits: CrawlEmit[] = [];

  while (queue.length > 0) {
    if (signal?.aborted) {
      break;
    }

    if (visited.size >= maxRequests) {
      break;
    }

    const url = queue.shift();

    if (!url || visited.has(url)) {
      continue;
    }

    visited.add(url);

    try {
      const result = await fetchRaw(url, { ...(signal && { signal }) });

      if (result === null) {
        // Soft-404 detected, skip as per Phase 1 rule
        continue;
      }

      const emit: CrawlEmit = {
        url,
        status: result.status,
        body: typeof result.body === 'string' ? result.body : JSON.stringify(result.body),
        semanticContext: {}
      };

      await step(emit, {
        enqueue: (childUrl: string) => {
          if (!visited.has(childUrl)) {
            queue.push(childUrl);
          }
        }
      });

      emits.push(emit);
    } catch {
      // Advance smoothly on failure
      continue;
    }
  }

  return emits;
}

export { type CrawlEmit, type CrawlControl, type CrawlStep, type CrawlOptions, crawl };
