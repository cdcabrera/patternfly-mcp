import { createHash } from 'crypto';
import { distance, closest } from 'fastest-levenshtein';

/**
 * Simple hash from content.
 *
 * @param {unknown} content - Content to hash
 * @returns {string} Hash string
 */
const generateHash = (content: unknown) =>
  createHash('sha1')
    .update(JSON.stringify({ value: (typeof content === 'function' && content.toString()) || content }))
    .digest('hex');

/**
 * Check if "is a Promise", "Promise like".
 *
 * @param {object} obj - Object to check
 * @returns {boolean} True if object is a Promise
 */
const isPromise = (obj: unknown) => /^\[object (Promise|Async|AsyncFunction)]/.test(Object.prototype.toString.call(obj));

/**
 * Fuzzy search result using fastest-levenshtein
 */
interface FuzzySearchResult {
  item: string;
  distance: number;
  matchType: 'exact' | 'prefix' | 'suffix' | 'contains' | 'fuzzy';
}

/**
 * Options for fuzzy search
 *
 * - `maxDistance` - Maximum edit distance for a match
 * - `maxResults` - Maximum number of results to return
 * - `isExactMatch` - Include exact matches
 * - `isPrefixMatch` - Include matches with prefix
 * - `isSuffixMatch` - Include matches with suffix
 * - `isContainsMatch` - Include matches with contains
 * - `isFuzzyMatch` - Include matches with fuzzy
 */
interface FuzzySearchOptions {
  maxDistance?: number;
  maxResults?: number;
  isExactMatch?: boolean;
  isPrefixMatch?: boolean;
  isSuffixMatch?: boolean;
  isContainsMatch?: boolean;
  isFuzzyMatch?: boolean;
}

/**
 * Lightweight normalization: trim, lowercase, remove diacritics, squash separators
 *
 * @param str
 */
const normalizeString = (str: string) => String(str || '')
  .trim()
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\s_\-]+/g, ' ')
  .replace(/\s+/g, ' ');

/**
 * Find the closest match using fastest-levenshtein's closest function.
 *
 * @param query - Search query string
 * @param items - Array of strings to search
 * @returns {string | null} Closest matching string or null
 *
 * @example
 * ```typescript
 * const result = findClosest('button', ['Button', 'ButtonGroup', 'Badge']);
 * // Returns: 'Button' (the closest match)
 * ```
 */
const findClosest = (
  query: string,
  items: string[]
): string | null => {
  const normalizedQuery = normalizeString(query);

  if (!normalizedQuery || !Array.isArray(items) || items.length === 0) {
    return null;
  }

  const normalizedItems = items.map(item => (item ? normalizeString(item) : item));
  const closestMatch = closest(normalizedQuery, normalizedItems);

  return items[normalizedItems.indexOf(closestMatch)] || null;
};

/**
 * Fuzzy search using fastest-levenshtein
 *
 * User input is trimmed to handle accidental spaces.
 *
 * @param query - Search query string
 * @param items - Array of strings to search
 * @param options - Search configuration options
 * @returns {FuzzySearchResult[]} Array of matching strings with distance and match type
 *
 * @example
 * ```typescript
 * const results = fuzzySearch('button', ['Button', 'ButtonGroup', 'Badge'], {
 *   maxDistance: 3,
 *   maxResults: 5
 * });
 * // Returns: [{ item: 'Button', distance: 0, matchType: 'exact' }, ...]
 * ```
 */
const fuzzySearch = (
  query: string,
  items: string[],
  options: FuzzySearchOptions = {}
): FuzzySearchResult[] => {
  const {
    maxDistance = 3,
    maxResults = 10,
    isExactMatch = true,
    isPrefixMatch = true,
    isSuffixMatch = true,
    isContainsMatch = true,
    isFuzzyMatch = false
  } = options;

  const queryNormalized = normalizeString(query);
  const seenItem = new Set<string>();
  const results: FuzzySearchResult[] = [];

  items.forEach(item => {
    if (seenItem.has(item)) {
      return;
    }

    seenItem.add(item);

    const itemNormalized = normalizeString(item);
    let editDistance = 0;
    let matchType: FuzzySearchResult['matchType'] | undefined;

    if (itemNormalized === queryNormalized) {
      matchType = 'exact';
    } else if (queryNormalized !== '' && itemNormalized.startsWith(queryNormalized)) {
      matchType = 'prefix';
    } else if (queryNormalized !== '' && itemNormalized.endsWith(queryNormalized)) {
      matchType = 'suffix';
    } else if (queryNormalized !== '' && itemNormalized.includes(queryNormalized)) {
      matchType = 'contains';
    } else if (isFuzzyMatch) {
      matchType = 'fuzzy';
      editDistance = distance(queryNormalized, itemNormalized);
    }

    if (matchType === undefined) {
      return;
    }

    const isIncluded = (matchType === 'exact' && isExactMatch) ||
      (matchType === 'prefix' && isPrefixMatch) ||
      (matchType === 'suffix' && isSuffixMatch) ||
      (matchType === 'contains' && isContainsMatch) ||
      (matchType === 'fuzzy' && isFuzzyMatch);

    if (editDistance <= maxDistance && isIncluded) {
      results.push({
        item,
        distance: editDistance,
        matchType
      });
    }
  });

  // Sort by distance (lowest first), then alphabetically
  results.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }

    return a.item.localeCompare(b.item);
  });

  return results.slice(0, maxResults);
};

export {
  generateHash,
  isPromise,
  normalizeString,
  fuzzySearch,
  findClosest,
  type FuzzySearchResult,
  type FuzzySearchOptions
};
