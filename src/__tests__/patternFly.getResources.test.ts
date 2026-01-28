import { getPatternFlyMcpDocs } from '../patternFly.getResources';

describe('getPatternFlyMcpDocs', () => {
  it('should return multiple organized facets from docs.json', () => {
    const result = getPatternFlyMcpDocs();

    expect(Object.keys(result)).toEqual(['original', 'availableVersions', 'bySection', 'byCategory', 'byPath']);
  });

  it('should have a memoized property', () => {
    expect(getPatternFlyMcpDocs).toHaveProperty('memo');
  });
});
