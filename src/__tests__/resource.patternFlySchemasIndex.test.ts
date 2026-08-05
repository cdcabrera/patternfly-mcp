import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  patternFlySchemasIndexResource,
  listResources,
  resourceCallback
} from '../resource.patternFlySchemasIndex';
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

describe('patternFlySchemasIndexResource', () => {
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
        versions: versions.filter(versionItem => !version || versionItem.toLowerCase() === version.toLowerCase().trim() || (version === 'current' && versionItem === 'v6') || (version === 'latest' && versionItem === 'v6')),
        schemas: names
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
      availableSchemasVersions: ['v6'],
      latestSchemasVersion: 'v6',
      byVersion: new Map([['v6', []]]),
      byVersionComponentNames: new Map([
        ['v6', {
          button: { isSchemasAvailable: true, displayName: 'Button' },
          card: { isSchemasAvailable: true, displayName: 'Card' }
        }]
      ])
    });

    const mockEntries = [
      { name: 'button', displayName: 'Button', category: 'react', version: 'v6', displayCategory: 'React', uriSchemas: 'patternfly://schemas/button' },
      { name: 'card', displayName: 'Card', category: 'react', version: 'v6', displayCategory: 'React', uriSchemas: 'patternfly://schemas/card' }
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
    const resource = patternFlySchemasIndexResource();

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
      /^patternfly:\/\/schemas\//.test(obj.uri) &&
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
      expected: '# PatternFly Component JSON Schemas Index for "v6"'
    },
    {
      description: 'explicit valid version',
      variables: {
        version: 'v6'
      },
      expected: '# PatternFly Component JSON Schemas Index for "v6"'
    }
  ])('should return component schemas index, $description', async ({ variables, expected }) => {
    const result = await resourceCallback(undefined as any, variables);

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0] as any)).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0]?.text).toContain(expected);
  });

  it.each([
    {
      description: 'version',
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
