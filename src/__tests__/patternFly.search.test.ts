import { filterPatternFly, searchPatternFly } from '../patternFly.search';

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
    }
  ])('should attempt to return filtered results, $description', async ({ filters }) => {
    const result = await filterPatternFly(filters as any);

    expect(result.byEntry.length).toBeGreaterThanOrEqual(0);
    expect(Array.from(result.byResource).length).toBeGreaterThanOrEqual(0);
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

import { dynamicFilterPatternFly, type FilterPatternFlyFilters } from '../patternFly.search';

describe('dynamicFilterPatternFly', () => {
  it.each([
    {
      description: 'return immediate single match if filters already narrow it down',
      searchQuery: 'ignored',
      filters: { name: 'modal' },
      options: {},
      expectedNames: ['modal']
    },
    {
      description: 'find a single match by applying searchQuery to "name"',
      searchQuery: 'modal',
      filters: {},
      options: { prioritizedFilters: ['name'] },
      expectedNames: ['modal']
    },
    {
      description: 'find a single match by applying searchQuery to "section"',
      searchQuery: 'layouts',
      filters: {},
      options: { prioritizedFilters: ['section'] },
      expectedNames: ['card']
    },
    {
      description: 'fallback to original results when using a broad section',
      searchQuery: 'components',
      filters: {},
      options: { prioritizedFilters: ['name'] },
      expectedNames: ['button', 'button', 'modal', 'card']
    },
    {
      description: 'fallback to original when using a broad category',
      searchQuery: 'view',
      filters: {},
      options: {},
      expectedNames: ['button', 'button', 'modal', 'card']
    },
    {
      description: 'skip iterative filter if useExistingFilters is true and filter is already set',
      searchQuery: 'modal',
      filters: { name: 'button' },
      options: { useExistingFilters: true, prioritizedFilters: ['name'] },
      expectedNames: ['button', 'button']
    },
    {
      description: 'use custom prioritizedFilters with increased max results',
      searchQuery: 'view',
      filters: {},
      options: { prioritizedFilters: ['category'], maxResultsLimit: 2 },
      expectedNames: ['modal', 'card']
    }
  ])('should $description', async ({ searchQuery, filters, options, expectedNames }) => {
    const mockResources = new Map([
      ['button', {
        name: 'button',
        entries: [
          { name: 'button', section: 'components', category: 'action', version: 'v6' },
          { name: 'button', section: 'components', category: 'action', version: 'v5' }
        ]
      }],
      ['modal', {
        name: 'modal',
        entries: [
          { name: 'modal', section: 'components', category: 'view', version: 'v6' }
        ]
      }],
      ['card', {
        name: 'card',
        entries: [
          { name: 'card', section: 'layouts', category: 'view', version: 'v6' }
        ]
      }]
    ]);

    const result = await dynamicFilterPatternFly(
      searchQuery,
      filters as FilterPatternFlyFilters,
      mockResources as any,
      options as any
    );

    expect(result.byEntry.map(result => result.name)).toEqual(expectedNames);
  });
});

describe('searchPatternFly', () => {
  it.each([
    {
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
    },
    {
      description: 'uri search with version',
      search: 'patternfly://schemas/modal?version=v6'
    },
    {
      description: 'uri search without version, prefix',
      search: 'patternfly://schemas/modal'
    },
    {
      description: 'button entry id hash',
      search: '5d642f0d9640119a074f5275c2a9459d2f18d9e1'
    }
  ])('should attempt to return an array of all available results, $description', async ({ search }) => {
    const { searchResults, ...rest } = await searchPatternFly(search, undefined, { allowWildCardAll: true });

    expect(searchResults.length).toBeGreaterThan(0);
    expect(Object.keys(rest)).toEqual(expect.arrayContaining([
      'isSearchWildCardAll',
      'firstExactMatch',
      'exactMatches',
      'remainingMatches',
      'totalResults',
      'totalPotentialMatches'
    ]));
  });

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
    },
    {
      description: 'button entry id hash,',
      search: '5d642f0d9640119a074f5275c2a9459d2f18d9e1',
      filters: {},
      options: { allowWildCardAll: true, dynamicFilter: true }
    }
  ])('should allow filtering, $description', async ({ search, filters, options }) => {
    const { searchResults, totalResults, totalPotentialMatches } = await searchPatternFly(search, filters, options || {});

    expect(searchResults.length).toBeGreaterThanOrEqual(0);
    expect(totalResults).toBeGreaterThanOrEqual(searchResults.length);
    expect(totalPotentialMatches).toBeGreaterThanOrEqual(totalResults);
  });
});
