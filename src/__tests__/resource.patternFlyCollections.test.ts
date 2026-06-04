import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  patternFlyCollectionsResource,
  listResources,
  resourceCallback
} from '../resource.patternFlyCollections';
import { isPlainObject } from '../server.helpers';
import { getPatternFlyContextManagementResources } from '../patternFly.getResources';
import { filterPatternFlyContext } from '../patternFly.search';

jest.mock('../patternFly.getResources', () => ({
  getPatternFlyContextManagementResources: {
    memo: jest.fn()
  }
}));

jest.mock('../patternFly.search', () => ({
  filterPatternFlyContext: {
    memo: jest.fn()
  }
}));

describe('patternFlyCollectionsResource', () => {
  it('should have a consistent return structure', () => {
    const resource = patternFlyCollectionsResource();

    expect({
      name: resource[0],
      uri: resource[1],
      config: isPlainObject(resource[2]),
      handler: resource[3]
    }).toMatchSnapshot('structure');
  });

  it('should only register if contextManagement is true', () => {
    const resource = patternFlyCollectionsResource();
    const meta = resource[5] as any;

    expect(meta.shouldRegister?.({ contextManagement: false } as any)).toBe(false);
    expect(meta.shouldRegister?.({ contextManagement: true } as any)).toBe(true);
  });
});

describe('listResources', () => {
  it('should return a list of resources', async () => {
    const resources = await listResources(undefined, undefined);

    expect(resources.resources).toBeDefined();

    const everyResourceSameProperties = resources.resources.every((obj: any) =>
      Boolean(obj.uri) &&
      /^patternfly:\/\/collections\//.test(obj.uri) &&
      Boolean(obj.name) &&
      Boolean(obj.mimeType) &&
      Boolean(obj.description));

    expect(everyResourceSameProperties).toBe(true);
  });

  it('should return a specific resource', async () => {
    (getPatternFlyContextManagementResources.memo as any).mockResolvedValue({
      collectionsIndex: [{ id: 'loremIpsum', displayName: 'lorem', description: 'desc' }]
    });

    const resources = await listResources(undefined, undefined);

    expect(resources.resources).toBeDefined();
    expect(resources.resources?.[0]?.uri).toBe('patternfly://collections/loremIpsum');
    expect(resources.resources?.[0]?.name).toContain('lorem');
  });
});

describe('resourceCallback', () => {
  it('should return content', async () => {
    (filterPatternFlyContext.memo as any)
      .mockResolvedValueOnce(new Map([['loremIpsum', { id: 'loremIpsum', name: 'button', displayName: 'Button', isCollection: true }]]));

    const result = await resourceCallback(undefined as any, { id: 'hash1' });

    expect(Object.keys(result.contents[0] as any)).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents?.[0]?.text).toBe('patternfly://collections/loremIpsum');
    expect(result.contents?.[0]?.text).toContain('Technical Specifications');
    expect(result.contents?.[0]?.text).toContain('Documentation & Guidelines');
  });

  it.each([
    {
      description: 'undefined id',
      variables: {
        id: undefined
      },
      error: 'The "id" parameter is required.'
    },
    {
      description: 'invalid id',
      variables: {
        id: 'invalid'
      },
      error: 'Collection hub not found'
    }
  ])('should handle variable errors, $description', async ({ error, variables }) => {
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(McpError);
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(error);
  });
});

/*
describe('patternFlyCollectionsResource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should only register if contextManagement is true', () => {
    const resource = patternFlyCollectionsResource();
    const meta = resource[5] as any;

    expect(meta.shouldRegister?.(getOptions())).toBe(false);

    const options = { ...getOptions(), contextManagement: true };

    expect(meta.shouldRegister?.(options)).toBe(true);
  });
});

describe('resourceCallback', () => {
  const options = { ...getOptions(), contextManagement: true };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return collection hub content for a valid group ID', async () => {
    const { getPatternFlyContextManagementResources } = await import('../patternFly.getResources');
    const { collectionsIndex } = await getPatternFlyContextManagementResources.memo();

    if (collectionsIndex.length === 0) {
      return;
    }

    const record = collectionsIndex[0];

    if (!record) {
      return;
    }

    const result = await runWithOptions(options, async () =>
      resourceCallback(new URL(`patternfly://collections/${record.id}`), { id: record.id }));

    expect(result.contents).toBeDefined();
    expect(result.contents[0]?.text).toContain(`# ${record.displayName}`);
    expect(result.contents[0]?.text).toContain('pfmcp_collection:');
  });

  it('should throw error for non-group ID', async () => {
    const { getPatternFlyContextManagementResources } = await import('../patternFly.getResources');
    const { versionIndex } = await getPatternFlyContextManagementResources.memo();
    const terminalRecord = versionIndex.find(record => !record.isCollection);

    if (!terminalRecord) {
      return;
    }

    await expect(runWithOptions(options, async () =>
      resourceCallback(new URL(terminalRecord.uri as string), { id: terminalRecord.id }))).rejects.toThrow('Collection hub not found');
  });
});

 */
