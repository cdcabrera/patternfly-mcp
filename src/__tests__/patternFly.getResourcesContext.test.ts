import {
  getPatternFlyContextManagementResources
} from '../patternFly.getResourcesContext';

describe('getPatternFlyContextManagementResources', () => {
  it('should return multiple organized facets', async () => {
    const result = await getPatternFlyContextManagementResources();

    expect(result.idIndex).toBeDefined();
    expect(result.collectionsIndex.size).toBeGreaterThan(0);
    expect(result.recordsList.every(record => record.id && record.name)).toBe(true);

    expect(Object.keys(result)).toMatchSnapshot('properties');
  });

  it('should have a memoized property', async () => {
    expect(getPatternFlyContextManagementResources).toHaveProperty('memo');
  });
});
