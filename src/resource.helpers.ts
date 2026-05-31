import { filterPatternFly, type FilterPatternFlyFilters } from './patternFly.search';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';

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

export { encodeDecodeCursor, nextCursor, paramCompletion };
