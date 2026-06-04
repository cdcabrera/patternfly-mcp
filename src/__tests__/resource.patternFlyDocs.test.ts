import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { patternFlyDocsResource, listResources, resourceCallback } from '../resource.patternFlyDocs';
import { isPlainObject } from '../server.helpers';
import { getPatternFlyContextManagementResources } from '../patternFly.getResources';
import { filterPatternFlyContext } from '../patternFly.search';
import { processDocsFunction } from '../server.getResources';

jest.mock('../patternFly.getResources', () => ({
  getPatternFlyContextManagementResources: { memo: jest.fn() }
}));

jest.mock('../patternFly.search', () => ({
  filterPatternFlyContext: { memo: jest.fn() }
}));

jest.mock('../server.getResources', () => ({
  processDocsFunction: { memo: jest.fn() }
}));

describe('patternFlyDocsResource', () => {
  it('should have a consistent return structure', () => {
    const resource = patternFlyDocsResource();

    expect({
      name: resource[0],
      uri: resource[1],
      config: isPlainObject(resource[2]),
      handler: resource[3]
    }).toMatchSnapshot('structure');
  });

  it('should only register if contextManagement is true', () => {
    const resource = patternFlyDocsResource();
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
      versionIndex: [{ id: 'loremIpsum', displayName: 'lorem', description: 'desc' }]
    });

    const resources = await listResources(undefined, undefined);

    expect(resources.resources).toBeDefined();
    expect(resources.resources?.[0]?.uri).toBe('patternfly://docs/loremIpsum');
    expect(resources.resources?.[0]?.name).toContain('lorem');
  });
});

describe('resourceCallback', () => {
  it('should return content', async () => {
    (filterPatternFlyContext.memo as any)
      .mockResolvedValueOnce(new Map([['loremIpsum', {
        id: 'loremIpsum', name: 'Alert', displayName: 'Alert', path: 'path/to/alert', isCollection: true, version: 'v6'
      }]]));

    (processDocsFunction.memo as any).mockResolvedValue({
      isSuccess: true,
      content: 'Alert documentation content',
      path: 'path/to/alert',
      uri: 'patternfly://docs/loremIpsum'
    });

    const result = await resourceCallback(undefined as any, { id: 'hash1' });

    expect(Object.keys(result.contents[0] as any)).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents?.[0]?.text).toBe('patternfly://docs/loremIpsum');
    expect(result.contents?.[0]?.text).toContain('Alert documentation content');
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
