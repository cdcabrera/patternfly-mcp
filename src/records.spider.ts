import { loadFileFetch } from './server.getResources';
import { getOptions } from './options.context';
import { log, formatUnknownError } from './logger';
import { assertInputUrlWhiteListed } from './server.assertions';

/**
 * Result emitted by the spider for each crawled page.
 *
 * @interface CrawlEmit
 * @property url - The URL of the crawled page.
 * @property status - HTTP status code (or 200 for local files).
 * @property body - The content of the page.
 * @property semanticContext - Semantic context derived from the URL or content.
 */
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

/**
 * Controller passed to the crawl step to manage the crawl process.
 *
 * @interface CrawlControl
 * @property enqueue - Enqueue a new URL to be crawled.
 */
interface CrawlControl {
  enqueue: (url: string) => void;
}

/**
 * A function that processes a single crawl emission and can enqueue new URLs.
 */
type CrawlStep = (emit: CrawlEmit, control: CrawlControl) => void | Promise<void>;

/**
 * Settings for the spider engine.
 *
 * @interface CrawlSettings
 *
 * @property fetchRaw - Custom fetch implementation. Defaults to `loadFileFetch`.
 * @property visited - Set of already visited URLs to avoid cycles.
 * @property maxRequests - Maximum number of requests to perform.
 * @property signal - AbortSignal for cancellation.
 */
interface CrawlSettings {
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
 * @param settings - Settings
 * @returns List of emitted results
 */
const crawl = async (
  seeds: string[],
  step: CrawlStep,
  settings: CrawlSettings = {}
): Promise<CrawlEmit[]> => {
  const options = getOptions();

  // Validate seeds against whitelist
  assertInputUrlWhiteListed(seeds, options.patternflyOptions.urlWhitelist, { inputDisplayName: 'Spider seeds' });

  const {
    fetchRaw = async (url, init) => {
      // Default to loadFileFetch which handles timeout, retry, and soft-404
      const res = await loadFileFetch(url, options, init?.signal ? { signal: init.signal } : undefined);

      if (res.content === null) {
        return null;
      }

      return { status: 200, body: res.content };
    },
    visited = new Set<string>(),
    maxRequests = 500,
    signal
  } = settings;

  const queue: string[] = [...seeds];
  const emits: CrawlEmit[] = [];

  while (queue.length > 0) {
    if (signal?.aborted) {
      break;
    }

    if (visited.size >= maxRequests) {
      log.debug(`Spider reached maxRequests limit: ${maxRequests}`);
      break;
    }

    const url = queue.shift();

    if (!url || visited.has(url)) {
      continue;
    }

    // Validate URL against whitelist before crawling
    try {
      assertInputUrlWhiteListed(url, options.patternflyOptions.urlWhitelist);
    } catch (error) {
      log.debug(`Spider skipping non-whitelisted URL ${url}: ${formatUnknownError(error)}`);
      continue;
    }

    visited.add(url);

    try {
      const result = await fetchRaw(url, signal ? { signal } : {});

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
    } catch (error) {
      log.debug(`Spider failed to crawl ${url}: ${formatUnknownError(error)}`);
    }
  }

  return emits;
};

export {
  crawl,
  type CrawlEmit,
  type CrawlControl,
  type CrawlStep,
  type CrawlSettings
};
