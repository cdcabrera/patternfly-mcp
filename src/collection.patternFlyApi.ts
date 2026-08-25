import {
  type McpCollection,
  type McpCollectionRecord,
  type McpCollectionResult
} from './collections';
import { log } from './logger';
import { processDocsFunction } from './server.getResources';
import { memo } from './server.caching';
import { isPlainObject, joinUrl } from './server.helpers';
import { isJson, isJsonLike } from './resource.helpers';
import {
  getOptions,
  getSessionOptions,
  runWithOptions,
  runWithSession
} from './options.context';
import { DEFAULT_OPTIONS } from './options.defaults';

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
 * @note Update accordingly. There's still a quality threshold that has to be met
 * if we prefer not blanket filtering entire categories.
 *
 * - `props`: Deferred in favor of utilizing @patternfly/patternfly-component-schemas.
 * - `react`: Deferred due to the presence of not-hydrated ?raw or <LiveExample /> stubs.
 * - `react-demos`: React demonstration components that are deferred.
 * - `html`: Deferred for HTML-related API categories.
 * - `html-demos`: Deferred for HTML demonstration examples.
 */
const DEFERRED_API_CATEGORIES = new Set<string>([
  'props',
  // 'react',
  'react-demos',
  // 'html',
  'html-demos'
]);

/**
 * Min content quality threshold.
 */
const MIN_API_QUALITY_THRESHOLD = 0.95;

/**
 * Detect imports that use the `?raw` query param.
 *
 * @param str
 */
const isRawImport = (str: string) =>
  /import\s+[\w*\s{},]+\s+from\s+['"][^'"]+\?raw['"]/i.test(str);

/**
 * Detect a `<LiveExample … />` tag.
 *
 * @param str
 */
const hasLiveExample = (str: string) => /<LiveExample\b[^>]*\/?>/i.test(str);

/**
 * Count the number of `<LiveExample>` tags in a given string.
 *
 * @param str - Input string to search for `<LiveExample>` tags.
 * @returns `<LiveExample>` count found in the input string.
 */
const getLiveExampleCount = (str: string) =>
  (str.match(/<LiveExample\b[^>]*\/?>/gi) || []).length;

/**
 * Detect empty code fences with external file references that weren't
 * inlined. (e.g., ```ts file = "./ButtonBasic.tsx" \n```)
 *
 * Considered empty if:
 * - A fenced code block with a `file` attribute is specified but no content.
 * - A fenced code block with no content inside the block, regardless of attributes or language.
 *
 * @param str - Input string.
 * @returns Returns `true` if the input string contains an empty code fence.
 */
const hasEmptyFileCodeFence = (str: string) =>
  /```[\w-]*\s+file="[^"]+"\s*\n\s*```/i.test(str) ||
  /```[\w-]*\s*\n\s*```/.test(str);

/**
 * Calculate a quality score for a PatternFly API response.
 *
 * @param content - Content to score.
 * @param options - Function options
 * @param options.baseScore - Base starting score.
 * @param options.qualityReduction - Amount to reduce the base score for each quality metric.
 * @param options.minCharacters - Minimum number of characters required to avoid quality reduction.
 * @returns The calculated quality score.
 */
const calculateContentQualityScore = (
  content: unknown,
  {
    baseScore = 1, qualityReduction = 0.03, minCharacters = 150
  }: { baseScore?: number; qualityReduction?: number; minCharacters?: number } = {}
): number => {
  if (content === undefined || content === null) {
    return baseScore;
  }

  const raw = typeof content === 'number' ? String(content) : content;

  if (typeof raw !== 'string') {
    return baseScore;
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return baseScore;
  }

  let score = baseScore;

  if (isJsonLike(trimmed)) {
    const jsonValid = isJson(trimmed);

    if (!jsonValid) {
      score -= qualityReduction;
    }
  }

  if (isRawImport(trimmed)) {
    score -= qualityReduction;
  }

  if (hasLiveExample(trimmed)) {
    score -= qualityReduction * getLiveExampleCount(trimmed);
  }

  if (trimmed.length < minCharacters && !trimmed.includes('```') && !hasEmptyFileCodeFence(trimmed)) {
    score -= qualityReduction;
  }

  if (hasEmptyFileCodeFence(trimmed)) {
    score -= qualityReduction;

    if (trimmed.length < minCharacters) {
      score -= qualityReduction;
    }
  }

  return Number(Math.min(1, Math.max(0, score)).toFixed(3));
};

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
  const componentPaths = options.patternflyOptions.api.componentPaths;
  const settled = await processDocsFunction(urls);
  const content: ApiCrawler[] = [];

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
 * Transform a string.
 *
 * @param segment - Input string to normalize.
 * @returns Normalized slug.
 */
const normalizeSlug = (segment: string): string => segment
  .trim()
  .toLowerCase()
  .replace(/_/g, '-')
  .replace(/-+/g, '-');

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
    const [version = 'unknown', section = 'unknown', rawItem = '', rawFacet = '', ...remaining] = segments;

    const normalizedSection = normalizeSlug(section);
    const normalizedItem = normalizeSlug(rawItem);
    const normalizedFacet = normalizeSlug(rawFacet || 'text');

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
 * Format a compound slug into a clean title.
 * E.g., 'ai-assisted-development_ai-assisted-code-migration' -> 'AI Assisted Development: AI Assisted Code Migration'
 *
 * @param slug
 * @param section
 */
const formatSlugToTitle = (slug: string, section?: string): string => {
  if (!slug) {
    return 'PatternFly API';
  }

  const cleanSection = section
    ? section
      .split('-')
      .map(wordPhrase =>
        (/^(ai|css|html|mcp|cli|uxd|ui|api|faq|faqs|aria|rtl)$/i.test(wordPhrase)
          ? wordPhrase.toUpperCase()
          : wordPhrase.charAt(0).toUpperCase() + wordPhrase.slice(1))).join(' ')
    : '';

  // Handle bare generic names like 'overview'
  if (slug.toLowerCase() === 'overview' && cleanSection) {
    return `${cleanSection} Overview`;
  }

  return slug
    .split('_')
    .map(segment =>
      segment
        .split('-')
        .map(word => {
          if (/^(ai|css|html|mcp|cli|uxd|ui|api|faq|faqs|aria|rtl)$/i.test(word)) {
            return word.toUpperCase();
          }

          return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' '))
    .join(': ');
};

/**
 * Generate a display name from metadata.
 *
 * @param [content] - Optional content string.
 * @param [slug=''] - Optional slug used for fallback or secondary formatting of the display name.
 * @param [kind='doc'] - Optional kind of content being processed (e.g., 'props', 'css', or 'doc').
 * @param [section] - Optional section name used for refining the display name.
 * @returns Extracted or formatted display name for the API item.
 */
const extractApiDisplayName = (content?: string, slug = '', kind = 'doc', section?: string): string => {
  const trimmed = content?.trim() || '';

  // Props JSON signature
  if (kind === 'props' && trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);

      if (parsed.name) {
        return parsed.name;
      }
    } catch {}
  }

  // CSS JSON Array signature
  if (kind === 'css') {
    return `${formatSlugToTitle(slug, section)} CSS`;
  }

  // Markdown H1 signature (# Title)
  const h1Match = trimmed.match(/^#\s+([^\r\n]+)/m);

  if (h1Match?.[1]?.trim()) {
    const title = h1Match[1].trim();

    // If the H1 is just "Overview", qualify it with the section
    if (title.toLowerCase() === 'overview' && section) {
      return formatSlugToTitle('overview', section);
    }

    return title;
  }

  // Fallback to slug
  return formatSlugToTitle(slug, section);
};

/**
 * Provide a fallback description based on kind/category when no prose is available.
 *
 * @param displayName - Display name
 * @param kind - Category / facet kind
 */
const getApiFallbackDescription = (displayName = '', kind = 'doc'): string => {
  switch (kind) {
    case 'props':
      return `PatternFly React component props and TypeScript interfaces for ${displayName}.`;
    case 'css':
      return `PatternFly ${
        displayName.toLowerCase().includes('css') ? '' : 'CSS '}variables and styling classes for ${displayName}.`;
    case 'html':
    case 'html-demos':
      return `PatternFly HTML examples and markup structure for ${displayName}.`;
    case 'react':
    case 'react-demos':
      return `PatternFly React component examples and demos for ${displayName}.`;
    default:
      return `PatternFly documentation and guidelines for ${displayName}.`;
  }
};

/**
 * Generate a description from metadata.
 *
 * @param [content] - Optional content.
 * @param [displayName=''] - Optional display name.
 * @param [kind='doc'] - Optional kind (e.g. 'doc', 'props', or 'css').
 * @returns A generated description from metadata, or a fallback.
 */
const extractApiDescription = (content?: string, displayName = '', kind = 'doc'): string => {
  // Immediate return on "generate something sane"
  if (kind === 'props' || kind === 'css') {
    return getApiFallbackDescription(displayName, kind);
  }

  if (content) {
    // Replace import statements, multiline code blocks
    const cleanContent = content
      .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/gm, '')
      .replace(/import\s+['"][^'"]+['"];?/gm, '')
      .replace(/```[\s\S]*?```/gm, '');

    // Filter headings, tags, and common HTML attributes
    const lines = cleanContent
      .split('\n')
      .map(line => line.trim())
      .filter(line =>
        line &&
        !line.startsWith('import ') &&
        !line.startsWith('#') &&
        !line.startsWith('---') &&
        !line.startsWith('![') &&
        !line.startsWith('<') &&
        !line.startsWith('```') &&
        !line.startsWith('export ') &&
        !line.startsWith('|') &&
        !line.startsWith('class=') &&
        !line.startsWith('className=') &&
        !line.startsWith('style=') &&
        !line.startsWith('d="') &&
        !line.startsWith('viewBox=') &&
        !/^[A-Za-z]+="(.*)"/.test(line) &&
        !/^(ts|tsx|js|jsx|html)\s+/i.test(line) &&
        !line.includes('file="./') &&
        !line.startsWith('["') &&
        !line.endsWith(',') &&
        !/^[A-Za-z0-9]+\./.test(line) &&
        !/^[A-Z][A-Za-z0-9]+,$/.test(line) &&
        line.length > 20);

    // Finally, does the copy exist?
    if (lines.length > 0 && lines[0]) {
      let cleanPara = lines[0]
        // markdown
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // formatting
        .replace(/[*_`]/g, '')
        .trim();

      if (cleanPara.endsWith(':')) {
        cleanPara = `${cleanPara.slice(0, -1)}.`;
      }

      return cleanPara.length > 200 ? `${cleanPara.slice(0, 197)}...` : cleanPara;
    }
  }

  // Fallback
  return getApiFallbackDescription(displayName, kind);
};

/**
 * Extracts and constructs an API entry name based on the provided item and section.
 *
 * @param item - Entry base name.
 * @param section - Entry section.
 * @returns Extracted entry name
 */
const extractApiName = (item: string, section: string): string => {
  const normalizedItem = item.trim().toLowerCase();
  const normalizedSection = section.trim().toLowerCase();

  if (normalizedSection === 'components') {
    return normalizedItem;
  }

  if (normalizedItem === 'overview') {
    return `${normalizedSection}-overview`;
  }

  // Prevent double-prefix
  if (normalizedItem.startsWith(`${normalizedSection}-`)) {
    return normalizedItem;
  }

  return `${normalizedSection}-${normalizedItem}`;
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

    const id = `api::${version}::${section}::${normalizedItem}::${kind}`;

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
      runParallel: '#collectionPatternFlyApi',
      runSchedule: {
        ...options.patternflyOptions.api.schedule
      }
    }
  ];
};

export {
  patternFlyApiCollection,
  collectionCallback,
  calculateContentQualityScore,
  isRawImport,
  getLiveExampleCount,
  hasEmptyFileCodeFence,
  hasLiveExample,
  apiSpider,
  crawler,
  isEmptyPayload,
  parsePayload,
  type ApiContent,
  type ApiCrawler,
  type ParsePayload,
  type ParsePayloadApi
};
