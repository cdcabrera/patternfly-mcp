import { getNodeMajorVersion, normalizeExperimentalOptions } from '../options.helpers';

describe('getNodeMajorVersion', () => {
  it('should get the current Node.js version', () => {
    // Purposeful failure in the event the process.versions.node value is not available
    expect(getNodeMajorVersion(process.versions.node)).not.toBe(0);
  });

  it.each([
    {
      description: 'number failure',
      value: 1_000_000,
      expected: 0
    },
    {
      description: 'string',
      value: 'lorem ipsum',
      expected: 0
    },
    {
      description: 'null failure',
      value: null,
      expected: 0
    },
    {
      description: 'undefined failure',
      value: undefined,
      expected: 0
    },
    {
      description: 'NaN failure',
      value: NaN,
      expected: 0
    },
    {
      description: 'operators',
      value: '<=20',
      expected: 20
    },
    {
      description: 'operators and semver',
      value: '<=20.0.1',
      expected: 20
    }
  ])('should handle, $description', ({ value, expected }) => {
    expect(getNodeMajorVersion(value as any)).toBe(expected);
  });
});

describe('normalizeExperimentalOptions', () => {
  it.each([
    {
      description: 'with a dash',
      params: { 'experimental-contextManagement': 'token-saver' },
      options: new Set(['contextManagement', 'pluginIsolation'])
    },
    {
      description: 'with lowerCamelCase',
      params: { experimentalContextManagement: 'token-saver' },
      options: new Set(['contextManagement', 'pluginIsolation'])
    },
    {
      description: 'as a regular option',
      params: { contextManagement: 'token-saver' },
      options: new Set(['contextManagement', 'pluginIsolation'])
    },
    {
      description: 'regular options unchanged',
      params: { mode: 'clii', contextManagement: 'token-saver', pluginIsolation: 'strict' },
      options: new Set(['contextManagement'])
    }
  ])('should normalize experimental prefixes, $description', ({ params, options }) => {
    const output = normalizeExperimentalOptions(params, options);

    expect(output).toMatchSnapshot();
  });

  /*
  it('should NOT flag stable options even if they are in the experimental set', () => {
    const options = { contextManagement: 'token-saver' };
    const { normalized, usedExperimental } = normalizeExperimentalOptions(options, experimentalOptions);

    expect(normalized).toEqual({ contextManagement: 'token-saver' });
    expect(usedExperimental).toEqual([]);
  });*/

  /*
  it('should leave non-experimental options unchanged', () => {
    const options = { mode: 'cli' };
    const { normalized, usedExperimental } = normalizeExperimentalOptions(options, experimentalOptions);

    expect(normalized).toEqual({ mode: 'cli' });
    expect(usedExperimental).toEqual([]);
  });

  it('should handle multiple experimental and stable options', () => {
    const options = {
      'experimental-contextManagement': 'token-saver',
      experimentalPluginIsolation: 'strict',
      mode: 'test'
    };
    const { normalized, usedExperimental } = normalizeExperimentalOptions(options, experimentalOptions);

    expect(normalized).toEqual({
      contextManagement: 'token-saver',
      pluginIsolation: 'strict',
      mode: 'test'
    });
    expect(usedExperimental.sort()).toEqual(['contextManagement', 'pluginIsolation'].sort());
  });
   */
});
