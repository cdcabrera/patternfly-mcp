import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  patternFlyDocsIndexResource,
  listResources,
  uriNameComplete,
  uriCategoryComplete,
  uriSectionComplete,
  uriVersionComplete,
  resourceCallback
} from '../resource.patternFlyDocsIndex';
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

describe('patternFlyDocsIndexResource', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockParamCompletion.mockImplementation(filters => {
      const { category, section, version, name } = filters || {};
      const names = ['Button', 'Card', 'Modal', 'Alert', 'Table', 'component-0', 'component-1', 'component-2', 'component-3', 'component-4'];
      const categories = ['accessibility', 'components', 'development'];
      const sections = ['guidelines', 'components'];
      const versions = ['v6'];

      const result = {
        names: names.filter(nameItem => !name || nameItem.toLowerCase().includes(name.toLowerCase().trim())),
        categories: categories.filter(categoryItem => !category || categoryItem.toLowerCase().includes(category.toLowerCase().trim())),
        sections: sections.filter(sectionItem => !section || sectionItem.toLowerCase().includes(section.toLowerCase().trim())),
        versions: versions.filter(versionItem => !version || versionItem.toLowerCase() === version.toLowerCase().trim() || (version === 'current' && versionItem === 'v6') || (version === 'latest' && versionItem === 'v6'))
      };

      // Special case for 'lorem' prefix in version complete tests
      if (version === 'lorem') {
        result.versions = [];
      }

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
      byVersion: new Map([
        ['v6', [
          {
            name: 'patternfly-docs-index',
            uri: 'patternfly://docs/index',
            mimeType: 'text/markdown',
            description: 'desc'
          }
        ]]
      ])
    });

    const mockEntries = Array.from({ length: 10 }, (_, i) => ({
      name: `component-${i}`,
      displayName: `Component ${i}`,
      category: 'accessibility',
      section: 'components',
      version: 'v6',
      path: `path/to/component-${i}`,
      uri: `patternfly://docs/component-${i}`,
      displayCategory: 'Accessibility'
    }));

    mockFilter.mockImplementation(filters => {
      const { category, section, version } = filters || {};
      let filtered = mockEntries;

      if (category) {
        filtered = filtered.filter(entryItem =>
          entryItem.category.toLowerCase().includes(category.toLowerCase()) ||
          entryItem.displayCategory.toLowerCase().includes(category.toLowerCase()));
      }

      if (section) {
        filtered = filtered.filter(entryItem => entryItem.section.toLowerCase().includes(section.toLowerCase()));
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
    const resource = patternFlyDocsIndexResource();

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
      /^patternfly:\/\/docs\//.test(obj.uri) &&
      Boolean(obj.name) &&
      Boolean(obj.mimeType) &&
      Boolean(obj.description));

    expect(everyResourceSameProperties).toBe(true);
  });
});

describe('uriNameComplete', () => {
  it.each([
    {
      description: 'with empty string',
      value: '',
      expected: 10
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

describe('uriCategoryComplete', () => {
  it.each([
    {
      description: 'empty returns all',
      value: ''
    },
    {
      description: 'prefix',
      value: 'ac'
    },
    {
      description: 'suffix',
      value: 'es'
    },
    {
      description: 'exact',
      value: 'accessibility'
    }
  ])('should attempt to return a category, $description', async ({ value }) => {
    const result = await uriCategoryComplete(value);

    expect(result.length).toBeGreaterThan(0);
    expect(result.join(', ')).toEqual(expect.stringContaining(value));
  });

  it('should not return any values for non-existent categories', async () => {
    const result = await uriCategoryComplete('lorem');

    expect(result.length).toBe(0);
  });
});

describe('uriSectionComplete', () => {
  it.each([
    {
      description: 'empty returns all',
      value: ''
    },
    {
      description: 'prefix',
      value: 'co'
    },
    {
      description: 'suffix',
      value: 'ts'
    },
    {
      description: 'exact',
      value: 'components'
    }
  ])('should attempt to return a section, $description', async ({ value }) => {
    const result = await uriSectionComplete(value);

    expect(result.length).toBeGreaterThan(0);
    expect(result.join(', ')).toEqual(expect.stringContaining(value));
  });

  it('should not return any values for non-existent section', async () => {
    const result = await uriSectionComplete('lorem');

    expect(result.length).toBe(0);
  });
});

describe('uriVersionComplete', () => {
  it.each([
    {
      description: 'all',
      value: '',
      expected: 'v6'
    },
    {
      description: 'exact',
      value: 'v6',
      expected: 'v6'
    },
    {
      description: 'exact, casing',
      value: 'V6',
      expected: 'v6'
    },
    {
      description: 'enumerated, current',
      value: 'current',
      expected: 'v6'
    },
    {
      description: 'enumerated, latest',
      value: 'latest',
      expected: 'v6'
    }
  ])('should attempt to return a version, $description', async ({ value, expected }) => {
    const result = await uriVersionComplete(value);

    expect(result.length).toBeGreaterThan(0);
    expect(result.join(', ')).toEqual(expect.stringContaining(expected));
  });

  it.each([
    {
      description: 'prefix',
      value: 'v'
    },
    {
      description: 'suffix',
      value: '6'
    },
    {
      description: 'non-existent',
      value: 'lorem'
    }
  ])('should not return any values, $description', async ({ value }) => {
    const result = await uriVersionComplete(value);

    expect(result.length).toBe(0);
  });
});

describe('resourceCallback', () => {
  it.each([
    {
      description: 'default',
      variables: {},
      expected: '# PatternFly Documentation Index for "v6"'
    },
    {
      description: 'explicit valid version',
      variables: {
        version: 'v6'
      },
      expected: '# PatternFly Documentation Index for "v6"'
    },
    {
      description: 'category',
      variables: {
        category: 'accessibility'
      },
      expected: 'category=accessibility'
    },
    {
      description: 'section',
      variables: {
        section: 'components'
      },
      expected: 'section=components'
    },
    {
      description: 'category and section',
      variables: {
        category: 'accessibility',
        section: 'components'
      },
      expected: 'category=accessibility&section=components'
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
