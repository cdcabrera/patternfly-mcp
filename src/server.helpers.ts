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
interface FuzzySearchResult<T> {
  item: T;
  distance: number;
  matchType: 'exact' | 'prefix' | 'contains' | 'fuzzy';
}

/**
 * Options for fuzzy search
 */
interface FuzzySearchOptions {
  maxDistance?: number;
  maxResults?: number;
  getText?: (item: T) => string;
}

/**
 * Find closest match using fastest-levenshtein's closest function
 *
 * @param query - Search query string
 * @param items - Array of items to search
 * @param options - Search configuration options
 * @returns Closest matching item or null if no match within maxDistance
 *
 * @example
 * ```typescript
 * const result = findClosest('button', ['Button', 'ButtonGroup', 'Badge']);
 * // Returns: 'Button' (the closest match)
 * ```
 */
const findClosest = <T>(
  query: string,
  items: T[],
  options: FuzzySearchOptions = {}
): T | null => {
  const { getText = (item: T) => String(item) } = options;
  const itemTexts = items.map(item => getText(item).toLowerCase());
  const queryLower = query.toLowerCase().trim();

  // Use fastest-levenshtein's closest function
  const closestText = closest(queryLower, itemTexts);
  const closestIndex = itemTexts.indexOf(closestText);

  return closestIndex >= 0 ? items[closestIndex] : null;
};

/**
 * Fuzzy search using fastest-levenshtein
 *
 * Leverages the package's distance function and uses closest for finding matches.
 * Returns results sorted by distance (lowest first).
 *
 * @param query - Search query string
 * @param items - Array of items to search
 * @param options - Search configuration options
 * @returns Array of matching items with distance and match type
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
const fuzzySearch = <T>(
  query: string,
  items: T[],
  options: FuzzySearchOptions = {}
): FuzzySearchResult<T>[] => {
  const {
    maxDistance = 3,
    maxResults = 10,
    getText = (item: T) => String(item)
  } = options;

  const queryLower = query.toLowerCase().trim();
  const results: FuzzySearchResult<T>[] = [];

  for (const item of items) {
    const text = getText(item);
    const textLower = text.toLowerCase();

    // Use fastest-levenshtein's distance function
    const editDistance = distance(queryLower, textLower);

    // Determine match type
    let matchType: FuzzySearchResult<T>['matchType'];
    if (editDistance === 0) {
      matchType = 'exact';
    } else if (textLower.startsWith(queryLower)) {
      matchType = 'prefix';
    } else if (textLower.includes(queryLower)) {
      matchType = 'contains';
    } else {
      matchType = 'fuzzy';
    }

    // Include if within maxDistance
    if (editDistance <= maxDistance) {
      results.push({
        item,
        distance: editDistance,
        matchType
      });
    }
  }

  // Sort by distance (lowest first), then alphabetically
  results.sort((a, b) => {
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    return getText(a.item).localeCompare(getText(b.item));
  });

  return results.slice(0, maxResults);
};

export {
  generateHash,
  isPromise,
  fuzzySearch,
  findClosest,
  type FuzzySearchResult,
  type FuzzySearchOptions
};
