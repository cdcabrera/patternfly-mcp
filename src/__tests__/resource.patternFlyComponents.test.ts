import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { patternFlyComponentsResource, listResources, resourceCallback } from '../resource.patternFlyComponents';
import { getOptions, runWithOptions } from '../options.context';
import { isPlainObject } from '../server.helpers';

describe('patternFlyComponentsResource', () => {
  it('should have a consistent return structure', () => {
    const resource = patternFlyComponentsResource();

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

/*
describe('patternFlyComponentsResource', () => {
  it('should only register if contextManagement is true', () => {
    const resource = patternFlyComponentsResource();
    const meta = resource[5] as any;

    expect(meta.shouldRegister?.(getOptions())).toBe(false);

    const options = { ...getOptions(), contextManagement: true };

    expect(meta.shouldRegister?.(options)).toBe(true);
  });
});

describe('resourceCallback', () => {
  const options = { ...getOptions(), contextManagement: true };

  it.each([
    {
      description: 'technical specs',
      contains: [
        ' (Technical overview)',
        '### Documentation & guidelines'
      ]
    }
  ])('should return a response for a valid component, $description', async ({ contains }) => {
    const { getPatternFlyContextManagementResources } = await import('../patternFly.getResources');
    const { versionIndex } = await getPatternFlyContextManagementResources.memo();
    const record = versionIndex.find(record => !record.isCollection && record.isSchemasAvailable);
    // const record = versionIndex.find(record => !record.isCollection && !record.isSchemasAvailable);

    const result = await runWithOptions(options, async () =>
      resourceCallback(new URL(`patternfly://components/${record?.id}`), { id: record?.id as any }));

    [record?.name, ...contains].forEach(item => expect(result.contents[0]?.text).toContain(item));

    // expect(result.contents[0]?.text).toContain(`Technical specifications and JSON schemas are not available for **${record.name}**`);
    // expect(result.contents[0]?.text).toContain(`patternfly://docs/${record.id}`);
  });

  it('should provide suggestion when collection ID is used', async () => {
    const { getPatternFlyContextManagementResources } = await import('../patternFly.getResources');
    const { collectionsIndex } = await getPatternFlyContextManagementResources.memo();
    const record = collectionsIndex[0];

    await expect(runWithOptions(options, async () =>
      resourceCallback(new URL(`patternfly://components/${record?.id}`), { id: record?.id as any })))
      .rejects.toThrow(`is a collection hub, not a specific component technical overview. Try accessing it via patternfly://collections/${record?.id}`);
  });
});
 */
