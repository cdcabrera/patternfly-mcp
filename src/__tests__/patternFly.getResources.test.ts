import {
  getPatternFlyComponentSchema,
  getPatternFlyReactComponentNames,
  getPatternFlyMcpDocs,
  getPatternFlyMcpResources
} from '../patternFly.getResources';

describe('getPatternFlyComponentSchema', () => {
  it.each([
    {
      description: 'default',
      componentName: 'Button',
      expected: true
    },
    {
      description: 'unknown component',
      componentName: 'Lorem',
      expected: false
    }
  ])('should attempt to return a schema', async ({ componentName, expected }) => {
    const output = await getPatternFlyComponentSchema(componentName);

    expect(Boolean(output)).toBe(expected);
  });

  it('should have a memoized property', () => {
    expect(getPatternFlyComponentSchema).toHaveProperty('memo');
  });
});

describe('getPatternFlyReactComponentNames', () => {
  it('should return multiple organized facets', () => {
    const result = getPatternFlyReactComponentNames();

    expect(Object.keys(result)).toMatchSnapshot('properties');
  });

  it('should have a memoized property', () => {
    expect(getPatternFlyReactComponentNames).toHaveProperty('memo');
  });
});

describe('getPatternFlyMcpDocs', () => {
  it('should return multiple organized facets', () => {
    const result = getPatternFlyMcpDocs();

    expect(Object.keys(result)).toMatchSnapshot('properties');
  });

  it('should have a memoized property', () => {
    expect(getPatternFlyMcpDocs).toHaveProperty('memo');
  });
});

describe('getPatternFlyMcpResources', () => {
  it('should return multiple organized facets', () => {
    const result = getPatternFlyMcpResources();

    expect(Object.keys(result)).toMatchSnapshot('properties');
  });

  it('should have a memoized property', () => {
    expect(getPatternFlyMcpResources).toHaveProperty('memo');
  });
});
