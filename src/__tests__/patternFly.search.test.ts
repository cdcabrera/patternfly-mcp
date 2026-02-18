import { searchPatternFly } from '../patternFly.search';

describe('searchPatternFly', () => {
  it('should return an array of search results', async () => {
    const { searchResults, ...rest } = await searchPatternFly('*', { allowWildCardAll: true });

    expect(searchResults.length).toBeGreaterThan(0);
    expect(Object.keys(rest)).toMatchSnapshot('keys');
  });

  it('should find a suffix match', async () => {
    const { searchResults } = await searchPatternFly('utton');

    expect(searchResults.filter(({ matchType }) => matchType === 'suffix')).toEqual([
      expect.objectContaining({
        item: expect.stringContaining('utton')
      })
    ]);
  });
});
