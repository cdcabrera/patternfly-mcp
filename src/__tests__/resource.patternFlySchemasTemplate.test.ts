import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  patternFlySchemasTemplateResource,
  uriNameComplete,
  resourceCallback
} from '../resource.patternFlySchemasTemplate';
import { isPlainObject } from '../server.helpers';
import {
  getPatternFlyComponentSchema,
  getPatternFlyMcpResources
} from '../patternFly.getResources';
import { filterPatternFly } from '../patternFly.search';
import { normalizeEnumeratedPatternFlyVersion } from '../patternFly.helpers';
import { paramCompletion } from '../resource.helpers';

// Mock dependencies
jest.mock('../patternFly.getResources', () => ({
  ...jest.requireActual('../patternFly.getResources'),
  getPatternFlyMcpResources: {
    memo: jest.fn()
  },
  getPatternFlyComponentSchema: {
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
const mockSchema = getPatternFlyComponentSchema.memo as unknown as jest.Mock;

describe('patternFlySchemasTemplateResource', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockParamCompletion.mockImplementation(filters => {
      const { category, version, name } = filters || {};
      const names = ['Button', 'Card', 'Modal', 'Alert', 'Table'];
      const categories = ['accessibility', 'components', 'development'];
      const versions = ['v6'];

      const result = {
        names: names,
        categories: categories.filter(categoryItem => !category || categoryItem.toLowerCase().includes(category.toLowerCase().trim())),
        sections: [],
        versions: versions.filter(versionItem => !version || versionItem.toLowerCase() === version.toLowerCase().trim() || (version === 'current' && versionItem === 'v6') || (version === 'latest' && versionItem === 'v6')),
        schemas: names.filter(nameItem => !name || nameItem.toLowerCase().includes(name.toLowerCase().trim()))
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
      { name: 'button', displayName: 'Button', category: 'react', version: 'v6', displayCategory: 'React', isSchemasAvailable: true, uriSchemas: 'patternfly://schemas/button', uriSchemasId: 'patternfly://schemas/button-id' },
      { name: 'card', displayName: 'Card', category: 'react', version: 'v6', displayCategory: 'React', isSchemasAvailable: true, uriSchemas: 'patternfly://schemas/card', uriSchemasId: 'patternfly://schemas/card-id' }
    ];

    mockFilter.mockImplementation(filters => {
      const { name, version } = filters || {};
      let filtered = mockEntries;

      if (name) {
        filtered = filtered.filter(entryItem =>
          entryItem.name.toLowerCase() === name.toLowerCase() ||
          entryItem.displayName.toLowerCase() === name.toLowerCase() ||
          (name === 'ffcfb1b9b852a17ccb5b2adc12e3edd4a4ee41cb' && entryItem.name === 'button'));
      }

      if (version) {
        filtered = filtered.filter(entryItem => entryItem.version.toLowerCase().includes(version.toLowerCase()));
      }

      return Promise.resolve({
        byEntry: filtered,
        byResource: new Map(filtered.map(entryItem => [entryItem.name, { ...entryItem, entries: [entryItem] }]))
      });
    });

    mockSchema.mockResolvedValue({
      $schema: 'http://json-schema.org/draft-07/schema#',
      title: 'Component',
      type: 'object'
    });
  });

  it('should have a consistent return structure', () => {
    const resource = patternFlySchemasTemplateResource();

    expect({
      name: resource[0],
      uri: resource[1],
      config: isPlainObject(resource[2]),
      handler: resource[3]
    }).toMatchSnapshot('structure');
  });
});

describe('uriNameComplete', () => {
  it.each([
    {
      description: 'with empty string',
      value: '',
      expected: 5
    },
    {
      description: 'with lowercased name',
      value: 'button',
      expected: 1
    },
    {
      description: 'with uppercased name',
      value: 'BUTTON',
      expected: 1
    },
    {
      description: 'with mixed case name',
      value: 'bUTTON',
      expected: 1
    },
    {
      description: 'with empty space and name',
      value: '  BUTTON  ',
      expected: 1
    }
  ])('should attempt to return PatternFly component names, $description', async ({ value, expected }) => {
    const result = await uriNameComplete(value);

    expect(result.length).toBeGreaterThanOrEqual(expected);
  });
});

describe('resourceCallback', () => {
  it.each([
    { description: 'no version', variables: { name: 'Button' } },
    {
      description: 'default',
      variables: {
        name: 'Button',
        version: 'v6'
      }
    },
    {
      description: 'with lowercased name',
      variables: {
        name: 'button',
        version: 'v6'
      }
    },
    {
      description: 'with hashed button name',
      variables: {
        name: 'ffcfb1b9b852a17ccb5b2adc12e3edd4a4ee41cb',
        version: 'v6'
      }
    }
  ])('should attempt to return resource content, $description', async ({ variables }) => {
    const mockContent = '$schema';

    const result = await resourceCallback(
      { href: `patternfly://schemas/v6/${variables.name}` } as any,
      variables
    );

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0] as any)).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0]?.text).toContain(mockContent);
  });

  it.each([
    {
      description: 'with missing or undefined name',
      error: 'must be a string',
      variables: {}
    },
    {
      description: 'with null name',
      error: 'must be a string',
      variables: {
        name: null
      }
    },
    {
      description: 'with empty name',
      error: 'must be a string',
      variables: {
        name: ''
      }
    },
    {
      description: 'with non-string name',
      error: 'must be a string',
      variables: {
        name: 123
      }
    },
    {
      description: 'non-existent name',
      error: 'No component JSON schemas found',
      variables: {
        name: 'loremIpsum',
        version: 'v6'
      }
    },
    {
      description: 'found but no schema',
      error: 'No component JSON schemas found',
      variables: {
        name: 'table',
        version: 'v6'
      }
    },
    {
      description: 'wrong version',
      error: 'Invalid PatternFly version',
      variables: {
        name: 'button',
        version: 'v5'
      }
    }
  ])('should handle variable errors, $description', async ({ error, variables }) => {
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(McpError);
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(error);
  });
});
