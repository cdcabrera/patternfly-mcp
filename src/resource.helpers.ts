import { filterPatternFly, type FilterPatternFlyFilters } from './patternFly.search';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { isPlainObject } from './server.helpers';

/**
 * Is content CSS-like?
 *
 * CSS matching:
 * - Selector or `@` followed by an opening brace
 * - Common `@` rules. (e.g., `@media`, `@keyframes`, `@import`)
 * - Property declarations (e.g., `color: red;`)
 * - URL usage (e.g., `url(some-url)`)
 *
 * @param content - Input value
 * @returns Returns `true` if the input matches CSS-like syntax.
 */
const isCssLike = (content: unknown): boolean => {
  if (typeof content !== 'string') {
    return false;
  }

  const trimmed = content.trim();
  const patterns = [
    /[\w\-#.$\s]+\s*\{/,
    /@media\b/,
    /@keyframes\b/,
    /@import\b/,
    /\s*\S+\s*:\s*[^;]+;/,
    /url\s*\(/i
  ];

  return patterns.some(re => re.test(trimmed));
};

/**
 * Is a value JSON?
 *
 * @param content - Input value
 * @param options - Options
 * @param options.allowEmpty - Allow empty JSON objects/arrays as valid JSON.
 * @returns Return `true` if parsed and non‑empty.
 */
const isJson = (content: unknown, { allowEmpty = true }: { allowEmpty?: boolean } = {}): boolean => {
  try {
    const parsed = typeof content === 'string' ? JSON.parse(content.trim()) : content;

    if (Array.isArray(parsed)) {
      return allowEmpty ? true : parsed.length > 0;
    }
    if (isPlainObject(parsed)) {
      return allowEmpty ? true : Object.keys(parsed).length > 0;
    }

    return false;
  } catch {
    return false;
  }
};

/**
 * Simple is JSON-like guard.
 *
 * @param content - Input value
 * @returns Return `true` if starts, ends with braces/brackets, is an Array or Object.
 */
const isJsonLike = (content: unknown): boolean => {
  if (typeof content === 'string') {
    const trimmed = content.trim();

    return (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    );
  }

  return Array.isArray(content) || isPlainObject(content);
};

/**
 * Is content a Markdown-formatted string?
 *
 * Markdown patterns:
 * - Headings (e.g., `# Heading`)
 * - Blockquotes (e.g., `> Blockquote`)
 * - Unordered lists (e.g., `- Item`, `+ Item`, `* Item`)
 * - Ordered lists (e.g., `1. Item`, `2. Item`)
 * - Inline links (e.g., `[link](url)`)
 * - Images (e.g., `![alt text](url)`)
 * - Fenced code blocks
 *
 * @param content - Input value.
 * @returns Returns `true` if the input matches "common" Markdown patterns.
 */
const isMarkdown = (content: unknown): boolean => {
  if (typeof content !== 'string') {
    return false;
  }

  const patterns = [
    /^(#+\s)/m, // headings
    /^>\s/m, // blockquote
    /^[-+*]\s/m, // unordered list
    /^\d+\.\s/m, // ordered list
    /\[.*\]\(.*\)/, // inline link
    /!\[.*\]\(.*\)/, // image
    /^```/m // fenced code block
  ];

  return patterns.some(re => re.test(content));
};

/**
 * Is content XML-like?
 *
 * XML matching:
 * - Start with an opening tag?
 * - Contains a corresponding closing tag?
 * - Matches common patterns in XML-like content. (e.g., HTML, SVG)
 *
 * @param content - Input value
 * @returns Returns `true` if the content is XML-like
 */
const isXmlLike = (content: unknown): boolean => {
  if (typeof content !== 'string') {
    return false;
  }
  const trimmed = content.trim();

  // Must start with a tag and contain a closing tag
  if (!/^<\s*\w+/.test(trimmed) || !/<\/\s*\w+\s*>/.test(trimmed)) {
    return false;
  }

  const indicators = [
    /<!DOCTYPE\s+html>/i,
    /<html\b/i,
    /<body\b/i,
    /<div\b/i,
    /<svg\b/i,
    /<script\b/i,
    /<style\b/i
  ];

  return indicators.some(re => re.test(trimmed));
};

/**
 * Determine the "type" of content based on its structure and formatting.

 * Content type identifiers:
 * - See {@link isMarkdown}
 * - See {@link isJsonLike} and {@link isJson}
 * - See {@link isCssLike}
 * - See {@link isXmlLike}
 *
 * @param content - Input value.
 * @returns A type of content string, or empty if the content type can't be determined.
 */
const contentType = (content: unknown): '' | 'md' | 'json' | 'html' | 'css' => {
  const updatedLanguage = '';

  if (content === null || content === undefined || (typeof content === 'string' && content.trim().length <= 0)) {
    return '';
  }

  if (isMarkdown(content as string)) {
    return 'md';
  }

  if (isJsonLike(content) || isJson(content)) {
    return 'json';
  }

  if (isXmlLike(content)) {
    return 'html';
  }

  if (isCssLike(content)) {
    return 'css';
  }

  return updatedLanguage;
};

/**
 * Format content as a code block for Markdown rendering.
 *
 * @param content - Content to format.
 * @param options - Config options for formatting.
 * @param [options.langOverride] - Override the detected language for highlighting.
 * @param [options.allowWrappingMarkdown=false] - Determine if already-marked Markdown content should be forcefully wrapped.
 * @returns A formatted content string wrapped in a Markdown code block, or the original content.
 */
const formatContentForMarkdown = (
  content: unknown,
  { langOverride, allowWrappingMarkdown = false }: { langOverride?: string; allowWrappingMarkdown?: boolean } = {}
) => {
  const updatedLanguage = langOverride || contentType(content);
  let updatedContent = content;

  if (!allowWrappingMarkdown && isMarkdown(updatedContent) && (!langOverride || updatedLanguage === 'markdown')) {
    return updatedContent;
  }

  if (updatedLanguage === 'json') {
    updatedContent = JSON.stringify(updatedContent, null, 2);
  }

  return `\`\`\`${updatedLanguage}\n${updatedContent}\n\`\`\``;
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

export {
  contentType,
  formatContentForMarkdown,
  isJson,
  isJsonLike,
  isCssLike,
  isMarkdown,
  isXmlLike,
  paramCompletion
};
