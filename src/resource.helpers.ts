import { filterPatternFly, type FilterPatternFlyFilters } from './patternFly.search';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { buildSearchString, stringJoin } from './server.helpers';

/**
 * Returns a consistent summarized, or full version, of the input text with:
 * - YAML front matter, if defined, is added to the front of the content.
 * - Full and summary links, if a URL is provided, are added to the end of the content.
 * - Summaries truncate to a configurable maximum length.
 * - Full content is returned as-is
 *
 * @param content - Input text to summarize or format.
 * @param [settings] - Optional settings object.
 * @param [settings.descLinkSummary='Read summary documentation'] - Description for the summary link.
 * @param [settings.descLinkFull='Read full documentation'] - Description for the full link.
 * @param [settings.descTruncate='truncated content'] - Description for the truncated content link.
 * @param [settings.descTruncateCode='truncated code block'] - Description for the truncated code block link.
 * @param [settings.detailType] - Whether to return a full or summary version of the content. Defaults to 'full'.
 * @param [settings.frontMatter] - YAML front matter to include in the content.
 * @param [settings.summaryLength] - The maximum length of the summary. Defaults to 250 characters.
 * @param [settings.url] - URL to link to.
 * @returns Formatted content with optional YAML front matter and links.
 */
const formatSummaryFullContent = (
  content: string,
  {
    descLinkSummary = 'Read summary documentation',
    descLinkFull = 'Read full documentation',
    descTruncate = 'truncated content',
    descTruncateCode = 'truncated code block',
    detailType = 'full',
    frontMatter,
    summaryLength = 250,
    url
  }: {
    descLinkSummary?: string;
    descLinkFull?: string;
    descTruncate?: string;
    descTruncateCode?: string;
    detailType?: 'full' | 'summary';
    frontMatter?: Record<string, string | undefined>;
    summaryLength?: number;
    url?: string | undefined;
  } = {}
) => {
  const isSummary = detailType === 'summary';
  const prefix = 'pfmcp_';

  let strippedContent = content;
  const existingFrontMatter: Record<string, string> = {};

  // Extract existing frontmatter from the beginning of the content.
  const frontMatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);

  if (frontMatterMatch) {
    strippedContent = content.slice(frontMatterMatch[0].length);
    const rawYaml = frontMatterMatch[1] || '';

    // Basic key-value parsing for YAML frontmatter.
    rawYaml.split(/\r?\n/).forEach(line => {
      const separatorIndex = line.indexOf(':');

      if (separatorIndex !== -1) {
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();

        if (key) {
          existingFrontMatter[key] = value;
        }
      }
    });
  }

  const ourFrontMatter: Record<string, string> = {};

  // Add prefixes to our frontmatter properties.
  if (frontMatter) {
    Object.entries(frontMatter).forEach(([key, value]) => {
      if (value) {
        ourFrontMatter[`${prefix}${key}`] = value;
      }
    });
  }

  // Add detail links and current detail type with prefixes.
  if (url) {
    const linkKey = isSummary ? `${prefix}full_uri` : `${prefix}summary_uri`;
    const searchParams = isSummary ? { detail: 'full' } : { detail: 'summary' };

    ourFrontMatter[linkKey] = `${url}${buildSearchString(searchParams, { base: url, prefix: true })}`;
  }

  ourFrontMatter[`${prefix}detail`] = isSummary ? 'full' : 'summary';

  // Merge existing frontmatter with ours. Ours takes precedence for collisions.
  const mergedFrontMatter = { ...existingFrontMatter, ...ourFrontMatter };

  const updatedFrontMatter = stringJoin.newlineFiltered(
    '---',
    ...Object.entries(mergedFrontMatter).map(([key, value]) => `${key}: ${value}`),
    '---'
  );

  let updatedLink;

  if (url) {
    updatedLink = isSummary
      ? `[${descLinkFull}](${url})`
      : `[${descLinkSummary}](${url})`;
  }

  if (detailType === 'full' || strippedContent.length <= summaryLength) {
    return stringJoin.newlineFiltered(
      updatedFrontMatter,
      strippedContent,
      updatedLink
    );
  }

  let truncated = strippedContent.substring(0, summaryLength);

  // Protect Code Blocks: If we are inside a code block, close it or back out.
  const codeBlockCount = (truncated.match(/```/g) || []).length;

  // If we are inside an odd number of code blocks, close it.
  if (codeBlockCount % 2 === 1) {
    const lastCodeBlock = truncated.lastIndexOf('```');

    if (lastCodeBlock > summaryLength * 0.5) {
      truncated = truncated.substring(0, lastCodeBlock).trim();
    } else {
      truncated += '\n... [' + descTruncateCode + ']\n```';
    }
  }

  // Protect Headers: Don't end on a trailing header line.
  const lastNewline = truncated.lastIndexOf('\n');
  const lastLine = truncated.substring(lastNewline + 1);

  if (lastLine.trim().startsWith('#')) {
    truncated = truncated.substring(0, lastNewline).trim();
  }

  // Breakpoint check
  const lastPeriod = truncated.lastIndexOf('.');
  const breakPoint = Math.max(lastPeriod, truncated.lastIndexOf('\n'));
  const updatedContent = breakPoint > summaryLength * 0.7
    ? truncated.substring(0, breakPoint + 1).trim()
    : truncated.trim();

  return stringJoin.newlineFiltered(
    updatedFrontMatter,
    `${updatedContent}... [${descTruncate}]`,
    updatedLink
  );
};

/**
 * Creates an object containing methods for encoding and decoding cursor values.
 * - Cursor encoding and decoding is based on a configurable `salt` and `encoding`.
 * - `encodeCursor` falls back to `0` if the provided offset is not a number or `undefined`.
 * - `decodeCursor` returns `0` if the provided cursor is not a string or empty.
 *
 * @param [params] - Options
 * @param [params.salt='offset'] - A string used as a prefix to encode cursor values.
 * @param [params.encoding='hex'] - The desired buffer encoding format for cursor strings.
 * @returns An object with methods for encoding and decoding cursors.
 * - `encodeCursor`: Encodes a numeric offset into a string cursor.
 * - `decodeCursor`: Decodes a string cursor back into a numeric offset.
 */
const encodeDecodeCursor = ({ salt = 'offset', encoding = 'hex' }: { salt?: string; encoding?: BufferEncoding } = {}) => ({
  encodeCursor: (offset?: number | undefined) => {
    if (typeof offset !== 'number') {
      return Buffer.from(`${salt}:0`).toString(encoding);
    }

    return Buffer.from(`${salt}:${offset}`).toString(encoding);
  },
  decodeCursor: (cursor?: string | undefined) => {
    if (typeof cursor !== 'string' || !cursor) {
      return 0;
    }

    try {
      const decrypted = Buffer.from(cursor, encoding).toString('utf8');
      const [_, offset] = decrypted.split(`${salt}:`);

      return (offset && parseInt(offset, 10)) || 0;
    } catch {
      return 0;
    }
  }
});

/**
 * Calculates the next cursor for paginated data.
 *
 * If the calculated index exceeds the size of the data, it returns `undefined`
 * to indicate the end of the available data.
 *
 * @param params - The parameter object.
 * @param params.cursor - The current encoded cursor position.
 * @param [params.pageSize=50] - The number of items per page.
 * @param  params.size - The total size of the data.
 * @returns The encoded next cursor or `undefined` if there is no next page.
 */
const nextCursor = ({ cursor, pageSize = 50, size }: { cursor: string | undefined; pageSize: number, size: number }) => {
  const { encodeCursor, decodeCursor } = encodeDecodeCursor();
  const index = decodeCursor(cursor);

  if (index + pageSize >= size) {
    return {
      next: undefined,
      start: index,
      end: size
    };
  }

  return {
    next: encodeCursor(index + pageSize),
    start: index,
    end: index + pageSize
  };
};

/**
 * Centralized completion logic for PatternFly resources.
 *
 * @param {FilterPatternFlyFilters} filters
 */
const paramCompletion = async (filters: FilterPatternFlyFilters) => {
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(filters.version);
  const { byEntry } = await filterPatternFly.memo({ ...filters, version: normalizedVersion || filters.version });

  const names = new Set<string>();
  const categories = new Set<string>();
  const sections = new Set<string>();
  const versions = new Set<string>();
  const schemas = new Set<string>();

  for (const entry of byEntry) {
    if (typeof entry.name === 'string') {
      names.add(entry.name);
    }

    if (typeof entry.category === 'string') {
      categories.add(entry.category);
    }

    if (typeof entry.section === 'string') {
      sections.add(entry.section);
    }

    if (typeof entry.version === 'string') {
      versions.add(entry.version);
    }

    if (entry.uriSchemas !== undefined && typeof entry.name === 'string') {
      schemas.add(entry.name);
    }
  }

  return {
    names: Array.from(names).sort(),
    categories: Array.from(categories).sort(),
    schemas: Array.from(schemas).sort(),
    sections: Array.from(sections).sort(),
    versions: Array.from(versions).sort()
  };
};

export { encodeDecodeCursor, formatSummaryFullContent, nextCursor, paramCompletion };
