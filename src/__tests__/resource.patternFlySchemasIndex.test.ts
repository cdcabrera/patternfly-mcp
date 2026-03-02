import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  patternFlySchemasIndexResource,
  listResources,
  uriVersionComplete,
  resourceCallback
} from '../resource.patternFlySchemasIndex';
import { isPlainObject } from '../server.helpers';

describe('patternFlySchemasIndexResource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'default',
      variables: {},
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
