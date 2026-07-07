import { log } from './logger';
// import {} from './server.task';
import { processDocsFunction, type ProcessedDoc } from './server.getResources';
import { memo } from './server.caching';
import { isPlainObject, joinUrl } from './server.helpers';
import { getOptions } from './options.context';
import { DEFAULT_OPTIONS } from './options.defaults';

/**
 * Parses the given payload and determines its state and structure.
 *
 * @param payload - Input payload to be parsed.
 * @returns An object containing:
 * - `isEmpty`: A boolean indicating whether the parsed payload is considered empty.
 * - `payload`: The parsed version of the input payload. If the input is a string
 *   and can be parsed as JSON without error, the parsed result is returned.
 *   Otherwise, the trimmed string or original value is provided.
 */
const parsePayload = (payload: unknown) => {
  const updatedPayload = typeof payload === 'string' ? payload.trim() : '';
  let isEmpty;
  let parsedPayload;

  try {
    parsedPayload = JSON.parse(updatedPayload);

    if (typeof parsedPayload === 'number') {
      isEmpty = false;
    } else {
      isEmpty = (Array.isArray(parsedPayload) && parsedPayload.length === 0) ||
        (isPlainObject(parsedPayload) && Object.keys(parsedPayload).length === 0) ||
        parsedPayload === null;
    }
  } catch {
    parsedPayload = updatedPayload;
    isEmpty = updatedPayload.length === 0;
  }

  return { isEmpty, payload: parsedPayload };
};

/**
 * Memoized version of parsePayload.
 */
parsePayload.memo = memo(parsePayload, DEFAULT_OPTIONS.resourceMemoOptions.default);

/**
 * Determines if the payload is empty.
 *
 * @param payload - Data to be evaluated for emptiness.
 * @returns Returns `true` if the payload is empty, otherwise `false`.
 */
const isEmptyPayload = (payload: unknown) => {
  if (typeof payload === 'string') {
    const trimmedPayload = payload.trim();

    return trimmedPayload === '' || trimmedPayload === '{}' || trimmedPayload === '[]' || trimmedPayload === 'null' || trimmedPayload === '""';
  }

  return payload === null || payload === undefined || parsePayload.memo(payload).isEmpty;
};

/**
 * Memoized version of isEmptyPayload.
 */
isEmptyPayload.memo = memo(isEmptyPayload, DEFAULT_OPTIONS.resourceMemoOptions.default);

/**
 * Recursively crawls a list of URLs.
 *
 * Resolves paths and fetches content; built specifically around the PatternFly API response structure.
 *
 * @param urls - The list of URLs to crawl.
 * @param [options] - An optional configuration object.
 * @returns {Promise<ProcessedDoc[]>} A promise that resolves to an array of processed documents,
 *     each containing information about the crawling result, status, and content.
 */
const crawler = async (urls: string[], options = getOptions()) => {
  const componentPaths = options.patternflyOptions.api.componentPaths;
  const settled = await processDocsFunction(urls);
  const content: ProcessedDoc[] = [];

  for (const res of settled) {
    const { isEmpty, payload } = parsePayload.memo(res.content);

    if (res.isSuccess) {
      if (Array.isArray(payload)) {
        if (componentPaths.some(componentPath => res?.path?.includes(componentPath))) {
          if (!isEmpty) {
            content.push({ ...res });
          }
          continue;
        }

        const updatedPayload = [...payload, ...componentPaths].map(path => joinUrl(res.path, path));
        const crawledContent = await crawler(updatedPayload);

        content.push(...crawledContent);
        continue;
      }

      if (!isEmpty) {
        content.push({ ...res });
      }
    }
  }

  return content;
};

/**
 * Get and process available API versions.
 *
 * @param [options=getOptions()] - Configuration options.
 * @returns A promise that resolves to an array of processed version URLs.
 */
const getVersions = async (options = getOptions()) => {
  const versionUrl = options.patternflyOptions.api.versions;
  const processedVersions = await processDocsFunction([versionUrl]);
  const versions: string[] = [];

  if (processedVersions[0]) {
    const response = processedVersions[0];

    if (response.isSuccess) {
      const { payload } = parsePayload.memo(response.content);

      if (Array.isArray(payload)) {
        versions.push(...payload.map(version => joinUrl(options.patternflyOptions.api.base, version)));
      }
    }
  }

  if (versions.length === 0) {
    log.error(`No API versions available ${versionUrl}.`);
  }

  return versions;
};

/**
 * Initiate API crawl.
 *
 * @returns A promise resolving to an array of content entries.
 */
const apiSpider = async () => {
  log.info(`API spider crawl started`);

  const seedVersions = await getVersions();
  const content = await crawler(seedVersions);

  /**
   * Spider shouldn't be doing double duty as the API crawler and full data parser.
   *
   * 1. Now we can pull out the version, section, category from the returned content/path after the crawl
   * 2. Need to setup a the managed task so we time the crawl out. Simple interrupt may work so it closes gracefully with the last group of fetches.
   */

  log.info(`API spider crawl completed. ${content.length} content ${(content.length === 1 && 'entry') || 'entries'} retrieved.`);

  return content;
};

export {
  apiSpider,
  crawler,
  isEmptyPayload,
  parsePayload
};
