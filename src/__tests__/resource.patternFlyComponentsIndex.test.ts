import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  patternFlyComponentsIndexResource,
  listResources,
  resourceCallback
} from '../resource.patternFlyComponentsIndex';
import { isPlainObject } from '../server.helpers';
import { getPatternFlyMcpResources } from '../patternFly.getResources';
import { filterPatternFly } from '../patternFly.search';
import { normalizeEnumeratedPatternFlyVersion } from '../patternFly.helpers';
import { paramCompletion } from '../resource.helpers';

// Mock dependencies
jest.mock('../patternFly.getResources', () => ({
  ...jest.requireActual('../patternFly.getResources'),
  getPatternFlyMcpResources: {
    memo: jest.fn()
  }
}));

jest.mock('../patternFly.search', () => ({
  filterPatternFly: {
    memo: jest.fn()
  }
}));

jest.mock('../patternFly.helpers', () => ({
  ...jest.requireActual('../patternFly.helpers'),
  normalizeEnumeratedPatternFlyVersion: {
    memo: jest.fn()
  }
}));

jest.mock('../resource.helpers', () => ({
  paramCompletion: jest.fn()
}));

jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => {
    const memoFn = jest.fn(fn);

    (memoFn as any).memo = memoFn;

    return memoFn;
  })
}));

const mockGetResources = getPatternFlyMcpResources.memo as unknown as jest.Mock;
const mockFilter = filterPatternFly.memo as unknown as jest.Mock;
const mockNormalize = normalizeEnumeratedPatternFlyVersion.memo as unknown as jest.Mock;
const mockParamCompletion = paramCompletion as unknown as jest.Mock;

describe('patternFlyComponentsIndexResource', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockParamCompletion.mockImplementation(filters => {
      const { category, version } = filters || {};
      const names = ['Button', 'Card', 'Modal', 'Alert', 'Table'];
      const categories = ['accessibility', 'components', 'development'];
      const versions = ['v6'];

      const result = {
        names: names,
        categories: categories.filter(categoryItem => !category || categoryItem.toLowerCase().includes(category.toLowerCase().trim())),
        sections: [],
        versions: versions.filter(versionItem => !version || versionItem.toLowerCase() === version.toLowerCase().trim() || (version === 'current' && versionItem === 'v6') || (version === 'latest' && versionItem === 'v6'))
      };

      return Promise.resolve(result);
    });

    mockNormalize.mockImplementation((vVal: string) => {
      if (!vVal || vVal.toLowerCase() === 'v6' || vVal.toLowerCase() === 'current' || vVal.toLowerCase() === 'latest') {
        return Promise.resolve('v6');
      }

      return Promise.resolve(undefined);
    });

    mockGetResources.mockResolvedValue({
      availableVersions: ['v6'],
      latestVersion: 'v6',
      byVersion: new Map([['v6', []]]),
      byVersionComponentNames: new Map([
        ['v6', {
          button: { isSchemasAvailable: true, displayName: 'Button' },
          card: { isSchemasAvailable: true, displayName: 'Card' }
        }]
      ])
    });

    const mockEntries = [
      { name: 'button', displayName: 'Button', category: 'react', version: 'v6', displayCategory: 'React' },
      { name: 'card', displayName: 'Card', category: 'react', version: 'v6', displayCategory: 'React' },
      { name: 'accessibility-test', displayName: 'Accessibility Test', category: 'accessibility', version: 'v6', displayCategory: 'Accessibility' }
    ];

    mockFilter.mockImplementation(filters => {
      const { category, version } = filters || {};
      let filtered = mockEntries;

      if (category) {
        filtered = filtered.filter(entryItem =>
          entryItem.category.toLowerCase().includes(category.toLowerCase()) ||
          entryItem.displayCategory.toLowerCase().includes(category.toLowerCase()));
      }

      if (version) {
        filtered = filtered.filter(entryItem => entryItem.version.toLowerCase().includes(version.toLowerCase()));
      }

      return Promise.resolve({
        byEntry: filtered,
        byResource: new Map(filtered.map(entryItem => [entryItem.name, { ...entryItem, entries: [entryItem] }]))
      });
    });
  });

  it('should have a consistent return structure', () => {
    const resource = patternFlyComponentsIndexResource();

    expect({
      name: resource[0],
      uri: resource[1],
      config: isPlainObject(resource[2]),
      handler: resource[3]
    }).toMatchSnapshot('structure');
  });
});

describe('listResources', () => {
  it('should return a list of resources', async () => {
    const resources = await listResources();

    expect(resources.resources).toBeDefined();

    const everyResourceSameProperties = resources.resources.every((obj: any) =>
      Boolean(obj.uri) &&
      /^patternfly:\/\/components\//.test(obj.uri) &&
      Boolean(obj.name) &&
      Boolean(obj.mimeType) &&
      Boolean(obj.description));

    expect(everyResourceSameProperties).toBe(true);
  });
});

describe('resourceCallback', () => {
  it.each([
    {
      description: 'default',
      variables: {},
      expected: '# PatternFly Components Index for "v6"'
    },
    {
      description: 'explicit valid version',
      variables: {
        version: 'v6'
      },
      expected: '# PatternFly Components Index for "v6"'
    },
    {
      description: 'category',
      variables: {
        category: 'accessibility'
      },
      expected: 'category=accessibility'
    }
  ])('should return context content, $description', async ({ variables, expected }) => {
    const result = await resourceCallback(undefined as any, variables);

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0] as any)).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0]?.text).toContain(expected);
  });

  it.each([
    {
      description: 'available version',
      variables: {
        version: 'v5'
      },
      error: 'Invalid PatternFly version'
    }
  ])('should handle variable errors, $description', async ({ error, variables }) => {
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(McpError);
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(error);
  });
});
