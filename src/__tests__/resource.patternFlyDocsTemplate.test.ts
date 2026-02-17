// import { readFile } from 'node:fs/promises';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { mockReadFile, mockFetch } from '../../jest.setupTests';
import {
  patternFlyDocsTemplateResource,
  listResources,
  uriVersionComplete,
  uriNameComplete,
  resourceCallback
} from '../resource.patternFlyDocsTemplate';
import { isPlainObject } from '../server.helpers';
import { DEFAULT_OPTIONS } from '../options.defaults';

/*
jest.mock('node:fs/promises', () => ({
  ...jest.requireActual('node:fs/promises'),
  readFile: jest.fn()
}));*/

// const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;

describe('patternFlyDocsTemplateResource', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a consistent return structure', () => {
    const resource = patternFlyDocsTemplateResource();

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

describe('uriVersionComplete', () => {
  it('should attempt to return enumerated PatternFly versions', async () => {
    await expect(uriVersionComplete('')).resolves.toEqual(expect.arrayContaining([
      ...DEFAULT_OPTIONS.patternflyOptions.availableSearchVersions
    ]));
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

describe('resourceCallback', () => {
  // let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    // fetchMock.mockRestore();
  });

  it.each([
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
      description: 'with local documentation',
      variables: {
        name: 'chatbot',
        version: 'v6'
      }
    }
  ])('should attempt to return resource content, $description', async ({ variables }) => {
    const mockContent = `Mock content for ${variables.name}`;

    mockReadFile.mockResolvedValue(mockContent);
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => mockContent
    } as any);

    const result = await resourceCallback(
      { href: `patternfly://docs/${variables.version}/${variables.name}` } as any,
      variables
    );

    expect(result.contents).toBeDefined();
    expect(Object.keys(result.contents[0] as any)).toEqual(['uri', 'mimeType', 'text']);
    expect(result.contents[0]?.text).toMatch(new RegExp(mockContent, 'i'));
  });

  it.each([
    {
      description: 'with missing or undefined name',
      error: 'Missing required parameter: name must be a string',
      variables: { version: 'v6' }
    },
    {
      description: 'with null name',
      error: 'Missing required parameter: name must be a string',
      variables: { name: null, version: 'v6' }
    },
    {
      description: 'with empty name',
      error: 'Missing required parameter: name must be a string',
      variables: { name: '', version: 'v6' }
    },
    {
      description: 'with non-string name',
      error: 'Missing required parameter: name must be a string',
      variables: { name: 123, version: 'v6' }
    },
    {
      description: 'non-existent name, missing version',
      error: 'No documentation found',
      variables: { name: 'loremIpsum' }
    }
  ])('should handle variable errors, $description', async ({ error, variables }) => {
    const mockContent = `Mock content for ${variables.name}`;

    mockReadFile.mockResolvedValue(mockContent);
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => mockContent
    } as any);

    const uri = new URL('patternfly://docs/test');

    await expect(resourceCallback(uri, variables as any)).rejects.toThrow(McpError);
    await expect(resourceCallback(uri, variables as any)).rejects.toThrow(error);
  });
});
