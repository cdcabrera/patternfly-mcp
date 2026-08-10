import { normalizeTuple, normalizeCollections } from '../server.collectionsUser';

describe('normalizeTuple', () => {
  it.each([
    {
      description: 'basic',
      tuple: ['loremIpsum', () => {}]
    },
    {
      description: 'untrimmed name, async handler',
      tuple: ['loremIpsum  ', async () => {}]
    },
    {
      description: 'missing handler',
      tuple: ['dolorSit']
    },
    {
      description: 'undefined',
      tuple: undefined
    },
    {
      description: 'null',
      tuple: null
    }
  ])('should normalize the config, $description', ({ tuple }) => {
    const updated = normalizeTuple(tuple);

    if (updated) {
      // Check the creator output
      const creator = updated.value as (...args: any[]) => any;

      const result = creator();

      expect(result).toEqual([
        updated.collectionName,
        expect.any(Function),
        { runInChildProcess: true, isInternal: false }
      ]);

      // Strip function from snapshots/assertions
      const original = updated.original as any;

      if (Array.isArray(original) && typeof original[1] === 'function') {
        original[1] = '[MockFunction]';
      }

      expect({
        ...updated,
        value: '[CollectionCreator]'
      }).toMatchSnapshot();
    } else {
      expect(updated).toBeUndefined();
    }
  });

  it('should have a memo property', () => {
    expect(normalizeTuple.memo).toBeDefined();
  });
});

describe('normalizeCollections', () => {
  it.each([
    {
      description: 'single tuple',
      config: ['loremIpsum', () => {}]
    },
    {
      description: 'array of tuples',
      config: [
        ['loremIpsum', () => {}],
        ['dolorSit', async () => {}]
      ]
    },
    {
      description: 'mix of non-configs',
      config: [null, undefined, { x: 1 }, new Error('lorem ipsum')]
    }
  ])('should normalize configs, $description', ({ config }) => {
    const result = normalizeCollections(config);
    const configLength = !normalizeTuple(config) && Array.isArray(config) ? config.length : 1;

    expect(result.length).toBe(configLength);
    expect(result.map(({ index, type, collectionName, error }) => ({ index, type, collectionName, error }))).toMatchSnapshot();
  });

  it('should flatten when using non-tuple configs (arrays)', () => {
    const config = [[1, 2, 3], ['lorem', 'ipsum', 'dolor', 'sit']];
    const result = normalizeCollections(config);
    const configLength = config.flat().length;

    expect(result.length).toBe(configLength);
  });

  it('should have a memo property', () => {
    expect(normalizeCollections.memo).toBeDefined();
  });

  it('should handle memoization context isolation', () => {
    const config = ['a', () => {}];
    const resultOne = normalizeCollections.memo(config);
    const resultTwo = normalizeCollections.memo(config);

    expect(resultTwo).toEqual(resultOne);
  });
});
