import { getPatternFlyMcpDocs } from '../patternFly.getResources';

describe('getPatternFlyMcpDocs', () => {
  it('should return multiple organized facets from docs.json', () => {
    const result = getPatternFlyMcpDocs();

    expect(Object.keys(result)).toEqual([
      'original',
      'availableVersions',
      'nameIndex',
      'bySection',
      'byCategory',
      'byGuidance',
      'byPath',
      'byNameWithPath',
      'byNameWithPathGuidance',
      'byNameWithPathNoGuidance'
    ]);
  });

  it('should have a memoized property', () => {
    expect(getPatternFlyMcpDocs).toHaveProperty('memo');
  });
});
