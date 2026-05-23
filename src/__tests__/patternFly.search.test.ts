import { filterPatternFly, searchPatternFly, setPatternFlyUriFilters } from '../patternFly.search';
/*
describe('filterPatternFly', () => {
  it.each([
    {
      description: 'all filter',
      filters: undefined
    },
    {
      description: 'all filter empty object',
      filters: {}
    },
    {
      description: 'all filter empty object',
      filters: { version: 'v5' }
    },
    {
      description: 'section, components',
      filters: { section: 'components' }
    },
    {
      description: 'category, accessibility',
      filters: { category: 'accessibility' }
    },
    {
      description: 'patternfly URI',
      filters: { version: 'v6', uri: 'patternfly://docs/inlineedit?version=v6' }
    },
    {
      description: 'patternfly URI schemas',
      filters: { version: 'v6', uri: 'patternfly://schemas/modal?version=v6' }
    }
  ])('should attempt to return filtered results, $description', async ({ filters }) => {
    const result = await filterPatternFly(filters as any);

    expect(result.byEntry.length).toBeGreaterThanOrEqual(0);
    expect(Array.from(result.byResource).length).toBeGreaterThanOrEqual(0);
  });

  it('should filter URI results if version is available', async () => {
    const result = await filterPatternFly(
      { version: 'v6', uri: 'patternfly://schemas/modal?version=v6' } as any,
      new Map([['loremIpsum', {
        name: 'loremIpsum',
        description: 'dolor sit amet, consectetur adipiscing elit.',
        entries: [{ section: 'dolor' }, { section: 'sit' }],
        versions: {
          v6: {
            uri: 'patternfly://schemas/modal?version=v6'
          }
        }
      }]]) as any
    );

    console.warn(result);

    expect(result.byEntry.length).toBe(0);
    expect(Array.from(result.byResource).length).toBe(0);
  });

  it('should fail to filter URI results if version is missing', async () => {
    const result = await filterPatternFly(
      { uri: 'patternfly://schemas/modal?version=v5' } as any,
      new Map([['loremIpsum', {
        entries: [{ section: 'dolor' }, { section: 'sit' }],
        versions: {
          v5: {
            uri: 'patternfly://schemas/modal?version=v5'
          }
        }
      }]]) as any
    );

    expect(result.byEntry.length).toBe(2);
    expect(Array.from(result.byResource).length).toBe(1);
  });

  it('should attempt to filter number results', async () => {
    const result = await filterPatternFly(
      { section: 1 } as any,
      new Map([['loremIpsum', { entries: [{ section: 1 }, { section: 'dolor' }] }]]) as any
    );

    expect(result.byEntry).toEqual(expect.arrayContaining([{ section: 1 }]));
    expect(Array.from(result.byResource).length).toBeGreaterThanOrEqual(0);
  });
});
*/

describe('searchPatternFly', () => {
  it.each([
    /*{
      description: 'wildcard search',
      search: '*'
    },
    {
      description: 'all search',
      search: 'all'
    },
    {
      description: 'empty all search',
      search: ''
    },*/
    {
      description: 'uri search',
      // search: 'patternfly://docs/inlineedit'
      // search: 'patternfly://docs/inlineedit?version=v6'
      search: 'patternfly://schemas/modal?version=v6'
    }
  ])('should attempt to return an array of all available results, $description', async ({ search }) => {
    const { searchResults, ...rest } = await searchPatternFly(search, undefined, { allowWildCardAll: true });

    console.warn('>>>>', search, rest);

    expect(searchResults.length).toBeGreaterThan(0);
    expect(Object.keys(rest)).toMatchSnapshot('keys');
  });
  /*
  it.each([
    {
      description: 'exact match',
      search: 'react',
      matchType: 'exact'
    },
    {
      description: 'partial prefix match',
      search: 're',
      matchType: 'prefix'
    },
    {
      description: 'partial suffix match',
      search: 'act',
      matchType: 'suffix'
    },
    {
      description: 'partial contains match',
      search: 'eac',
      matchType: 'contains'
    }
  ])('should attempt to match components and keywords, $description', async ({ search, matchType }) => {
    const { searchResults } = await searchPatternFly(search);

    expect(searchResults.find(({ matchType: returnMatchType }) => returnMatchType === matchType)).toEqual(expect.objectContaining({
      query: expect.stringMatching(search)
    }));
  });

  it.each([
    {
      description: 'version',
      search: 'about modal',
      filters: { version: 'v5' }
    },
    {
      description: 'section',
      search: 'popover',
      filters: { section: 'components' }
    },
    {
      description: 'category',
      search: '*',
      filters: { category: 'grammar' },
      options: { allowWildCardAll: true }
    }
  ])('should allow filtering, $description', async ({ search, filters, options }) => {
    const { searchResults, totalResults, totalPotentialMatches } = await searchPatternFly(search, filters, options || {});

    expect(searchResults.length).toBeGreaterThanOrEqual(0);
    expect(totalResults).toBeGreaterThanOrEqual(searchResults.length);
    expect(totalPotentialMatches).toBeGreaterThanOrEqual(totalResults);
  });
  */
});

describe('setPatternFlyUriFilters', () => {
  it.each([
    {
      description: 'no search parameters',
      uri: 'patternfly://docs/inlineedit',
      expected: { name: 'inlineedit' }
    },
    {
      description: 'version parameter',
      uri: 'patternfly://docs/inlineedit?version=v6',
      expected: { version: 'v6', name: 'inlineedit' }
    },
    {
      description: 'all parameters',
      uri: 'patternfly://docs/inlineedit?version=v6&section=components&category=accessibility',
      expected: { version: 'v6', name: 'inlineedit', section: 'components', category: 'accessibility' }
    }
  ])('should set uri filters, $description', ({ uri, expected }) => {
    const uriFilters = setPatternFlyUriFilters(uri);

    expect(uriFilters).toEqual(expected);
  });
});
