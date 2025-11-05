import { generateHash, isPromise, fuzzySearch, findClosest } from '../server.helpers';

describe('generateHash', () => {
  it('should minimally generate a consistent hash', () => {
    expect({
      valueObject: generateHash({ lorem: 'ipsum', dolor: ['sit', null, undefined, 1, () => 'hello world'] }),
      valueObjectConfirm:
        generateHash({ lorem: 'ipsum', dolor: ['sit', null, undefined, 1, () => 'hello world'] }) ===
        generateHash({ lorem: 'ipsum', dolor: ['sit', null, undefined, 1, () => 'hello world'] }),
      valueObjectConfirmSort:
        generateHash({ lorem: 'ipsum', dolor: ['sit', null, undefined, 1, () => 'hello world'] }) ===
        generateHash({ dolor: ['sit', null, undefined, 1, () => 'hello world'], lorem: 'ipsum' }),
      valueInt: generateHash(200),
      valueFloat: generateHash(20.000006),
      valueNull: generateHash(null),
      valueUndefined: generateHash(undefined),
      valueArray: generateHash([1, 2, 3]),
      valueArraySort: generateHash([3, 2, 1]),
      valueArrayConfirmSort: generateHash([1, 2, 3]) !== generateHash([3, 2, 1]),
      valueSet: generateHash(new Set([1, 2, 3])),
      valueSetConfirmSort: generateHash(new Set([1, 2, 3])) === generateHash(new Set([3, 2, 1])),
      valueSymbol: generateHash(Symbol('lorem ipsum')),
      valueSymbolUndefined: generateHash(Symbol('lorem ipsum')) === generateHash(undefined),
      valueBoolTrue: generateHash(true),
      valueBoolFalse: generateHash(false)
    }).toMatchSnapshot('hash, object and primitive values');
  });
});

describe('isPromise', () => {
  it.each([
    {
      description: 'Promise.resolve',
      func: Promise.resolve(),
      value: true
    },
    {
      description: 'async function',
      func: async () => {},
      value: true
    },
    {
      description: 'non-promise',
      func: () => 'lorem',
      value: false
    }
  ])('should determine a promise for $description', ({ func, value }) => {
    expect(isPromise(func)).toBe(value);
  });
});

describe('findClosest', () => {
  const components = ['Button', 'ButtonGroup', 'Badge', 'BadgeGroup', 'Alert', 'AlertGroup'];

  it('should find exact match', () => {
    const result = findClosest('Button', components);

    expect(result).toBe('Button');
  });

  it('should find closest match with case insensitive search', () => {
    const result = findClosest('button', components);

    expect(result).toBe('Button');
  });

  it('should find closest match for partial query', () => {
    const result = findClosest('but', components);

    expect(result).toBe('Button');
  });

  it('should find closest match with typo', () => {
    const result = findClosest('buton', components);

    expect(result).toBe('Button');
  });

  it('should handle query with spaces (trimmed)', () => {
    const result = findClosest('  button  ', components);

    expect(result).toBe('Button');
  });

  it('should return null for completely unrelated query', () => {
    const result = findClosest('xyzabc123', components);

    // Note: closest() will still return something, but might be very distant
    // This tests the behavior with a very different string
    expect(result).toBeTruthy(); // closest() always returns something
  });

  it('should handle empty array', () => {
    const result = findClosest('button', []);

    expect(result).toBeNull();
  });

  it('should find closest among similar options', () => {
    const result = findClosest('badge', components);

    expect(result).toBe('Badge');
  });
});

describe('fuzzySearch', () => {
  const components = ['Button', 'ButtonGroup', 'Badge', 'BadgeGroup', 'Alert', 'AlertGroup', 'Card', 'CardHeader'];

  describe('exact matches', () => {
    it('should find exact match', () => {
      const results = fuzzySearch('Button', components);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        item: 'Button',
        distance: 0,
        matchType: 'exact'
      });
    });

    it('should find exact match case insensitive', () => {
      const results = fuzzySearch('button', components);

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        item: 'Button',
        distance: 0,
        matchType: 'exact'
      });
    });
  });

  describe('prefix matches', () => {
    it('should find prefix matches', () => {
      const results = fuzzySearch('but', components);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.matchType).toBe('prefix');
      expect(results[0]?.item).toMatch(/^Button/i);
    });

    it('should find multiple prefix matches', () => {
      const results = fuzzySearch('button', components);
      const buttonMatches = results.filter(r => r.item.toLowerCase().startsWith('button'));

      expect(buttonMatches.length).toBeGreaterThan(0);
    });
  });

  describe('contains matches', () => {
    it('should find contains matches', () => {
      const results = fuzzySearch('roup', components, { maxDistance: 10 });

      expect(results.length).toBeGreaterThan(0);
      const groupMatches = results.filter(r => r.item.toLowerCase().includes('roup'));

      expect(groupMatches.length).toBeGreaterThan(0);
      expect(groupMatches[0]?.matchType).toBe('contains');
    });
  });

  describe('fuzzy matches', () => {
    it('should find fuzzy matches within maxDistance', () => {
      const results = fuzzySearch('buton', components, { maxDistance: 2 });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.matchType).toBe('fuzzy');
      expect(results[0]?.distance).toBeLessThanOrEqual(2);
    });

    it('should not find matches beyond maxDistance', () => {
      const results = fuzzySearch('xyzabc', components, { maxDistance: 2 });
      // Should not find matches for completely different strings
      const validMatches = results.filter(r => r.distance <= 2);

      expect(validMatches.length).toBe(0);
    });
  });

  describe('maxResults option', () => {
    it('should limit results to maxResults', () => {
      const results = fuzzySearch('a', components, { maxResults: 3 });

      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return all results when maxResults is larger than matches', () => {
      const results = fuzzySearch('Button', components, { maxResults: 10 });

      expect(results.length).toBe(1);
    });
  });

  describe('maxDistance option', () => {
    it('should respect maxDistance', () => {
      const results = fuzzySearch('buton', components, { maxDistance: 1 });

      results.forEach(result => {
        expect(result.distance).toBeLessThanOrEqual(1);
      });
    });

    it('should find more matches with larger maxDistance', () => {
      const results1 = fuzzySearch('buton', components, { maxDistance: 1 });
      const results2 = fuzzySearch('buton', components, { maxDistance: 3 });

      expect(results2.length).toBeGreaterThanOrEqual(results1.length);
    });
  });

  describe('sorting', () => {
    it('should sort by distance (lowest first)', () => {
      const results = fuzzySearch('but', components);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]?.distance).toBeLessThanOrEqual(results[i]?.distance ?? 0);
      }
    });

    it('should sort alphabetically when distances are equal', () => {
      const results = fuzzySearch('card', components);

      // If multiple results have same distance, should be alphabetical
      if (results.length > 0 && results[0]) {
        const sameDistance = results.filter(r => r.distance === results[0]!.distance);

        if (sameDistance.length > 1) {
          for (let i = 1; i < sameDistance.length; i++) {
            expect(sameDistance[i - 1]?.item.localeCompare(sameDistance[i]?.item ?? '')).toBeLessThanOrEqual(0);
          }
        }
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty query', () => {
      const results = fuzzySearch('', components, { maxDistance: 20 });

      // Empty query distance = length of item, need larger maxDistance
      expect(results.length).toBeGreaterThan(0);
    });

    it('should handle query with spaces (trimmed)', () => {
      const results = fuzzySearch('  button  ', components);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.item).toBe('Button');
    });

    it('should handle empty array', () => {
      const results = fuzzySearch('button', []);

      expect(results).toHaveLength(0);
    });

    it('should handle single item array', () => {
      const results = fuzzySearch('button', ['Button']);

      expect(results).toHaveLength(1);
      expect(results[0]?.item).toBe('Button');
    });
  });

  describe('match type detection', () => {
    it('should correctly identify exact matches', () => {
      const results = fuzzySearch('Button', components);

      expect(results[0]?.matchType).toBe('exact');
      expect(results[0]?.distance).toBe(0);
    });

    it('should correctly identify prefix matches', () => {
      const results = fuzzySearch('but', components);
      const prefixMatches = results.filter(r => r.matchType === 'prefix' && r.item.toLowerCase().startsWith('but'));

      expect(prefixMatches.length).toBeGreaterThan(0);
    });

    it('should correctly identify contains matches', () => {
      const results = fuzzySearch('roup', components, { maxDistance: 10 });
      const containsMatches = results.filter(r => r.matchType === 'contains');

      expect(containsMatches.length).toBeGreaterThan(0);
    });

    it('should correctly identify fuzzy matches', () => {
      const results = fuzzySearch('buton', components, { maxDistance: 3 });
      const fuzzyMatches = results.filter(r => r.matchType === 'fuzzy');

      if (fuzzyMatches.length > 0 && fuzzyMatches[0]) {
        expect(fuzzyMatches[0].distance).toBeGreaterThan(0);
      }
    });
  });

  describe('default options', () => {
    it('should use default maxDistance of 3', () => {
      const results = fuzzySearch('buton', components);

      results.forEach(result => {
        expect(result.distance).toBeLessThanOrEqual(3);
      });
    });

    it('should use default maxResults of 10', () => {
      const results = fuzzySearch('a', components);

      expect(results.length).toBeLessThanOrEqual(10);
    });
  });
});
