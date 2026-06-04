import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { patternFlyDocsResource, listResources, resourceCallback } from '../resource.patternFlyDocs';
import { isPlainObject } from '../server.helpers';

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
});

describe('resourceCallback', () => {
  it.each([
    {
      description: 'default',
      variables: {
        id: 'hash1'
      },
      expected: '# PatternFly Collections Index for "v6"'
    }
  ])('should return context content, $description', async ({ variables, expected }) => {
    const result = await resourceCallback(undefined as any, variables);

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0] as any)).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0]?.text).toContain(expected);
  });

  it.each([
    {
      description: 'id',
      variables: {
        id: 'hash1'
      },
      error: 'Invalid ID'
    }
  ])('should handle variable errors, $description', async ({ error, variables }) => {
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(McpError);
    await expect(resourceCallback(undefined as any, variables as any)).rejects.toThrow(error);
  });
});
