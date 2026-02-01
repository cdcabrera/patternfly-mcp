import { findClosestPatternFlyVersion } from '../patternFly.helpers';
import { readLocalFileFunction } from '../server.getResources';

jest.mock('../server.getResources', () => ({
  ...jest.requireActual('../server.getResources'),
  readLocalFileFunction: {
    memo: jest.fn()
  }
}));

const mockReadLocalFile = readLocalFileFunction.memo as jest.Mock;

describe('findClosestPatternFlyVersion', () => {
  it.each([
    {
      description: 'non-existent path',
      path: '/mock/package.json',
      expected: 'v6'
    },
    {
      description: 'non-string path',
      path: 1,
      expected: 'v6'
    }
  ])('should return default version if no package.json is found, $description', async ({ path, expected }) => {
    const version = await findClosestPatternFlyVersion(path as any);

    expect(version).toBe(expected);
  });

  /*
  it.each([
    {
      description: 'caret, major',
      depVersion: '^5.0.0',
      expected: 'v5'
    },
    {
      description: 'caret, major, minor, patch',
      depVersion: '^5.5.5',
      expected: 'v5'
    },
    {
      description: 'tilde, major, minor, patch',
      depVersion: '~5.5.5',
      expected: 'v5'
    },
    {
      description: 'less than or equal, major, minor, patch',
      depVersion: '>=5.5.5',
      expected: 'v5'
    },
    {
      description: 'greater than or equal, major, minor, patch',
      depVersion: '<=5.5.5',
      expected: 'v6'
    },
    {
      description: 'range, greater than less than equal',
      depVersion: '>=4.0.0 <=5.0.0',
      expected: 'v5'
    },
    {
      description: 'range, inclusive',
      depVersion: '4.0.0 - 5.0.0',
      expected: 'v5'
    },
    {
      description: 'git path',
      depVersion: 'https://github.com/patternfly/patternfly-mcp.git#v5',
      expected: 'v6'
    },
    {
      description: 'unknown local path',
      depVersion: './patternfly-mcp#v5',
      expected: 'v6'
    }
  ])('should attempt to find the closest PatternFly version, $description', async ({ depVersion, expected }) => {
    mockReadLocalFile.mockResolvedValue(JSON.stringify({
      dependencies: {
        '@patternfly/react-core': depVersion
      }
    }));

    // Use the PF MCP package.json so we can override with "mockReadLocalFile"
    const version = await findClosestPatternFlyVersion(process.cwd());

    expect(version).toBe(expected);
  });
  */

  /*
  it('should attempt to find the closest PatternFly version with multiple mismatched versions', async () => {
    mockReadLocalFile.mockResolvedValue(JSON.stringify({
      dependencies: {
        '@patternfly/patternfly': '^4.0.0',
        '@patternfly/react-core': '^5.0.0'
      }
    }));

    // Use the PF MCP package.json so we can override with "mockReadLocalFile"
    const version = await findClosestPatternFlyVersion(process.cwd());

    expect(version).toBe('v5');
  });
  */

  it.each([
    {
      description: 'basic',
      deps: {
        '@patternfly/react-core': '^5.0.0'
      },
      expected: 'v5'
    },
    {
      description: 'greater than or equal, major, minor, patch',
      deps: {
        '@patternfly/react-core': '<=4.5.5'
      },
      expected: 'v6'
    },
    {
      description: 'range, greater than less than equal',
      deps: {
        '@patternfly/react-core': '>=4.0.0 <=5.0.0'
      },
      expected: 'v5'
    },
    {
      description: 'range, inclusive',
      deps: {
        '@patternfly/react-core': '4.0.0 - 5.0.0'
      },
      expected: 'v5'
    },
    {
      description: 'git path',
      deps: {
        '@patternfly/react-core': 'https://github.com/patternfly/patternfly-mcp.git#v5'
      },
      expected: 'v6'
    },
    {
      description: 'unknown local path',
      deps: {
        '@patternfly/react-core': './patternfly-mcp#v5'
      },
      expected: 'v6'
    },
    {
      description: 'mismatched versions',
      deps: {
        '@patternfly/patternfly': '^4.0.0',
        '@patternfly/react-core': '^5.0.0'
      },
      expected: 'v5'
    },
    {
      description: 'fuzzy match -next',
      deps: {
        '@patternfly/react-core-next': '^5.0.0'
      },
      expected: 'v5'
    },
    {
      description: 'fuzzy match -rc',
      deps: {
        '@patternfly/react-core-rc': '^5.0.0'
      },
      expected: 'v5'
    },
    {
      description: 'fuzzy match -alpha',
      deps: {
        '@patternfly/patternfly-alpha': '^5.0.0'
      },
      expected: 'v5'
    },
    {
      description: 'fuzzy match -beta',
      deps: {
        '@patternfly/patternfly-beta': '^5.0.0'
      },
      expected: 'v5'
    },
    {
      description: 'wildcard match',
      deps: {
        '@patternfly/patternfly': '^5.x.x'
      },
      expected: 'v5'
    }
  ])('should attempt to match whitelisted packages, $description', async ({ deps, expected }) => {
    mockReadLocalFile.mockResolvedValue(JSON.stringify({
      dependencies: { ...deps }
    }));

    // Use the PF MCP package.json so we can override with "mockReadLocalFile"
    const version = await findClosestPatternFlyVersion(process.cwd());

    expect(version).toBe(expected);
  });
});
