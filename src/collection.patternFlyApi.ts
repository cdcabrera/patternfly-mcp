import {
  type McpCollection,
  type McpCollectionRecord,
  type McpCollectionResult
} from './collections';
import { log } from './logger';
import { processDocsFunction } from './server.getResources';
import { memo } from './server.caching';
import { isPlainObject, joinUrl } from './server.helpers';
import {
  getOptions,
  getSessionOptions,
  runWithOptions,
  runWithSession
} from './options.context';
import { DEFAULT_OPTIONS } from './options.defaults';
import {
  calculateContentQualityScore,
  extractApiDescription,
  extractApiDisplayName,
  extractApiName,
  normalizeSlug
} from './collection.patternFlyApiHelpers';

/**
 * Processed content for API responses.
 *
 * @property url - The URL of the content.
 * @property content - The content itself.
 * @property semanticContext - Semantic context of the content.
 * @property semanticContext.version - PatternFly version of the content.
 * @property semanticContext.section - Section of the content.
 * @property semanticContext.item - Item of the content.
 * @property semanticContext.facet - Facet of the content.
 * @property semanticContext.kind - Kind of the content.
 * @property semanticContext.metadata - Remaining metadata, if any, of the content.
 */
interface ApiContent {
  url: string;
  content: string;
  semanticContext: {
    version?: string | undefined;
    section?: string | undefined;
    pathSlug?: string | undefined;
    item?: string | undefined;
    facet?: string | undefined;
    detail?: string | undefined;
    kind?: string | undefined;
    metadata?: string[] | undefined;
  }
}

/**
 * API crawler response.
 *
 * @interface ApiCrawler
 *
 * @property content - Content retrieved from the API.
 * @property path - Initial or relative path used to fetch the content.
 * @property resolvedPath - Absolute or resolved path after processing the initial path.
 */
interface ApiCrawler {
  content: string;
  path: string;
  resolvedPath: string;
}

/**
 * API parsed payload response
 */
type ParsePayloadApi = string | number | boolean | null | string[] | Record<string, unknown>;

/**
 * API parsed payload response.
 *
 * @interface ParsePayload
 *
 * @property isEmpty - Whether the parsed payload is considered empty.
 * @property {ParsePayloadApi} payload - Parsed version of the input payload.
 */
interface ParsePayload {
  isEmpty: boolean;
  payload: ParsePayloadApi;
}

/**
 * Deferred API categories.
 *
 * @note Minimal PatternFly API data quality threshold
 * - Last resort for content that requires additional parsing or should be ignored.
 * - A quality threshold still has to be met even if these items are removed
 * - Quality metrics need to be updated periodically as API content is added.
 *
 * - `props`: Deferred in favor of using @patternfly/patternfly-component-schemas.
 * - `react`: Quality threshold applied. Some examples still contain low-quality data.
 * - `react-demos`: Deferred React demonstration components.
 * - `html`: Quality threshold applied. Some examples still contain low-quality data.
 * - `html-demos`: Deferred HTML demonstration examples.
 * - `text`: Quality threshold applied. Some examples still contain low-quality data.
 */
const DEFERRED_API_CATEGORIES = new Set<string>([
  'props',
  // 'react',
  'react-demos',
  // 'html',
  'html-demos'
  // 'text',
  // 'examples'
]);

/**
 * Min content quality threshold. See {@link calculateContentQualityScore}
 */
const MIN_API_QUALITY_THRESHOLD = 0.95;

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
const parsePayload = (payload: unknown): ParsePayload => {
  const updatedPayload = typeof payload === 'string' ? payload.trim() : '';
  let isEmpty: boolean;
  let parsedPayload: ParsePayloadApi;

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
const crawler = async (urls: string[], options = getOptions()): Promise<ApiCrawler[]> => {
  const { componentPaths, traversalPaths } = options.patternflyOptions.api;
  const settled = await processDocsFunction(urls);
  const content: ApiCrawler[] = [];

  for (const res of settled) {
    if (!res.isSuccess) {
      continue;
    }

    const { isEmpty, payload } = parsePayload.memo(res.content);

    if (Array.isArray(payload)) {
      // 1. Terminal Data Arrays (props, css, etc)
      if (componentPaths.some(componentPath => res?.path?.includes(componentPath))) {
        if (!isEmpty) {
          content.push({ ...res });
        }
        continue;
      }

      // 2. Traversal & Directory Array Processing
      const flattenedPayload: string[] = [];

      payload.forEach(value => {
        if (typeof value === 'string') {
          flattenedPayload.push(value);
        // } else if (isPlainObject(value) && !Object.keys(value).includes('error')) {
        } else if (isPlainObject(value)) {
          Object.values(value).forEach(value => {
            if (typeof value === 'string') {
              flattenedPayload.push(value);

              log.info(`Adding paths >>>`, value);
            }
          });
        }
      });

      const updatedPayload = [...flattenedPayload, ...traversalPaths, ...componentPaths].map(path => joinUrl(res.path, path));

      log.info(`Crawling ${updatedPayload.length} paths`, JSON.stringify(updatedPayload));

      const crawledContent = await crawler(updatedPayload);

      content.push(...crawledContent);
      continue;
    }

    // 3. String Payloads (Markdown, HTML, .tsx source code)
    if (!isEmpty) {
      content.push({ ...res });
    }

    // 4. Probe Traversal Paths on Facet Endpoints (e.g. /react -> /react/examples)
    if (!traversalPaths.some(traversalPath => res?.path?.includes(traversalPath))) {
      const traversalUrls = traversalPaths.map(traversalPath => joinUrl(res.path, traversalPath));
      const traversalCrawledContent = await crawler(traversalUrls);

      content.push(...traversalCrawledContent);
    }
  }

  return content;
};

/**
 * Get and process available API versions.
 *
 * @param [options=getOptions()] - Configuration options.
 * @returns A promise that resolves to an array of processed version URLs.
 *
 * @throws
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
    throw new Error(`No API versions available ${versionUrl}.`);
  }

  return versions;
};

/**
 * Light/Immediate process for content metadata from response paths.
 *
 * @param apiResponses - The list of pre-metadata content.
 * @param [options=getOptions()] - Configuration options.
 * @returns The list of processed API content with metadata.
 */
const contentMetadata = (apiResponses: ApiCrawler[], options = getOptions()): ApiContent[] => {
  const base = options.patternflyOptions.api.base;
  const componentPaths = options.patternflyOptions.api.componentPaths;

  return apiResponses.map(({ content, resolvedPath }) => {
    // Relative path after '/api/'
    const segments = resolvedPath.replace(base, '').split('/').filter(Boolean);
    const [version = 'unknown', section = 'unknown', rawItem = '', rawFacet = '', rawDetail = '', ...remaining] = segments;

    const normalizedSection = normalizeSlug(section);
    const normalizedItem = normalizeSlug(rawItem);
    const normalizedFacet = normalizeSlug(rawFacet || 'text');
    const normalizedDetail = normalizeSlug(rawDetail);

    // Kind is the specific facet (props, css, html, text, doc)
    const kind = componentPaths.includes(normalizedFacet) ? normalizedFacet : normalizedFacet || 'doc';

    // Build hierarchical normalized path slug: e.g. "ai/overview/text" or "components/button/props"
    const pathSlug = [normalizedSection, normalizedItem, normalizedFacet]
      .filter(Boolean)
      .join('-');

    return {
      url: resolvedPath,
      content,
      semanticContext: {
        version: version.toLowerCase(),
        pathSlug,
        section: normalizedSection,
        item: normalizedItem,
        facet: normalizedFacet,
        detail: normalizedDetail,
        kind,
        metadata: remaining.length ? remaining.map(normalizeSlug) : undefined
      }
    };
  });
};

/**
 * Memoized version of contentMetadata.
 */
contentMetadata.memo = memo(contentMetadata);

/**
 * Initiate API crawl.
 *
 * @returns A promise resolving to an array of processed API content entries.
 */
const apiSpider = async (): Promise<ApiContent[]> => {
  log.info(`API spider crawl started`);
  let seedVersions: string[] = [];
  let content: ApiCrawler[] = [];

  try {
    seedVersions = await getVersions();
  } catch (err) {
    log.warn(`API spider: getVersions failed`, err);

    return [];
  }

  if (seedVersions.length) {
    try {
      content = await crawler(seedVersions);
    } catch (err) {
      log.warn(`API spider: crawler failed`, err);

      return [];
    }
  }

  // Review the memo here. It may be better served to tie into crawler,
  // like `crawler.memo` as part of the countdown to refresh
  const updatedContent = contentMetadata.memo(content);

  log.info(
    `API spider crawl completed. ${updatedContent.length} content ${
      (updatedContent.length === 1 && 'entry') || 'entries'
    } retrieved.`
  );

  return updatedContent;
};

/**
 * Async collect and process entries for a collection. Add "conditional" metadata.
 *
 * @returns {Promise<McpCollectionResult>} Object containing a list of processed records.
 */
const collectionCallback = async (): Promise<McpCollectionResult> => {
  const entries = await apiSpider();
  const recordsMap: Map<string, McpCollectionRecord> = new Map();

  entries?.forEach(entry => {
    const semanticContext = entry.semanticContext || {};
    const version = semanticContext.version || 'unknown';
    const kind = semanticContext.kind || 'doc';
    const section = semanticContext.section || 'components';
    const normalizedItem = semanticContext.item || 'api-entry';
    const normalizedDetail = semanticContext.detail;

    // Deferred Category Filter
    if (DEFERRED_API_CATEGORIES.has(kind.toLowerCase())) {
      return;
    }

    // Quality Assessment Threshold
    const quality = calculateContentQualityScore(entry.content);

    if (quality < MIN_API_QUALITY_THRESHOLD) {
      return;
    }

    const name = extractApiName(normalizedItem, section);

    const id = `api::${version}::${section}::${normalizedItem}::${kind}${normalizedDetail ? `::${normalizedDetail}` : ''}`;

    if (recordsMap.has(id)) {
      return;
    }

    const displayName = extractApiDisplayName(entry.content, normalizedItem, kind, section);
    const adaptedEntry = {
      displayName,
      description: extractApiDescription(entry.content, displayName, kind),
      pathSlug: semanticContext.pathSlug,
      category: kind,
      section,
      source: 'api' as const,
      version,
      id,
      path: entry.url,
      content: entry.content
    };

    const record = {
      id,
      sourceId: entry.url,
      sourceType: 'api' as const,
      data: {
        [name]: [adaptedEntry]
      }
    };

    recordsMap.set(record.id, record);
  });

  return { records: [...recordsMap.values()] };
};

/**
 * Create a PatternFly API collection.
 *
 * @param options - Global options
 * @param session - Session options
 * @returns {McpCollection} The collection definition tuple
 */
const patternFlyApiCollection = (options = getOptions(), session = getSessionOptions()): McpCollection => {
  const callback: McpCollection[1] = async () =>
    runWithSession(session, async () =>
      runWithOptions(options, async () => collectionCallback()));

  return [
    'patternfly-api',
    callback,
    {
      // runParallel: '#collectionPatternFlyApi',
      runSchedule: {
        ...options.patternflyOptions.api.schedule
      }
    }
  ];
};

export {
  patternFlyApiCollection,
  collectionCallback,
  apiSpider,
  crawler,
  isEmptyPayload,
  parsePayload,
  type ApiContent,
  type ApiCrawler,
  type ParsePayload,
  type ParsePayloadApi
};
