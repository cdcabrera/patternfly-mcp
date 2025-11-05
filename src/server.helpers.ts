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
  matchType: 'exact' | 'prefix' | 'contains' | 'fuzzy';
}

/**
 * Options for fuzzy search
 */
interface FuzzySearchOptions {
  maxDistance?: number;
  maxResults?: number;
}

/**
 * Find the closest match using fastest-levenshtein's closest function
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
  // Trim query (user input) to handle accidental spaces, but don't trim items
  const queryLower = query.toLowerCase().trim();

  return closest(queryLower, items) || null;
};

/**
 * Fuzzy search using fastest-levenshtein
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
    maxResults = 10
  } = options;

  // Trim query (user input) to handle accidental spaces, but don't trim items
  // (authoritative data) to preserve them as-is. Component names are PascalCase
  // and shouldn't have spaces, but preserving items is safer.
  const queryLower = query.toLowerCase().trim();
  const results: FuzzySearchResult[] = [];

  for (const item of items) {
    const itemLower = item.toLowerCase();

    // Use fastest-levenshtein's distance function
    const editDistance = distance(queryLower, itemLower);

    // Determine match type
    let matchType: FuzzySearchResult['matchType'];

    if (editDistance === 0) {
      matchType = 'exact';
    } else if (itemLower.startsWith(queryLower)) {
      matchType = 'prefix';
    } else if (itemLower.includes(queryLower)) {
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

    return a.item.localeCompare(b.item);
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
