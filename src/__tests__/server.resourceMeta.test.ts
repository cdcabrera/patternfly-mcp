import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { setMetaResources } from '../server.resourceMeta';
// import { type McpResource } from '../server';
// import { getOptions, initializeSession } from '../options.context';

describe('setMetaResources', () => {
  let server: McpServer;
  // const options = getOptions();
  // const session = initializeSession();

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    jest.spyOn(server, 'registerResource').mockImplementation(() => ({} as any));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(setMetaResources).toBeDefined();
  });

  /*
  test('should return original resource if enableMeta is false', () => {
    const callback = jest.fn();
    const resource: McpResource = [
      'test-resource',
      'test://uri',
      { title: 'Test', description: 'Test' },
      callback,
      { enableMeta: false }
    ];

    const result = registerResourceMeta(server, ...resource, options, session);

    expect(result).toEqual(resource);
    expect(server.registerResource).not.toHaveBeenCalled();
  });

  test('should register meta resource and enhance callback if enableMeta is true', async () => {
    const callback = jest.fn().mockResolvedValue({ contents: [{ uri: 'test://uri', text: 'original' }] });
    const metaHandler = jest.fn().mockResolvedValue({
      title: 'Meta Title',
      description: 'Meta Desc',
      params: [],
      exampleUris: []
    });

    const resource: McpResource = [
      'test-resource',
      new ResourceTemplate('test://uri{?a}', { list: undefined }),
      { title: 'Test', description: 'Test' },
      callback,
      { enableMeta: true, metaHandler }
    ];

    const result = registerResourceMeta(server, ...resource, options, session);

    // Should have registered the meta resource
    expect(server.registerResource).toHaveBeenCalledWith(
      'test-resource-meta',
      expect.any(ResourceTemplate),
      expect.objectContaining({ title: 'Test Metadata' }),
      expect.any(Function)
    );

    // Enhanced callback should return 2 contents
    const enhancedCallback = result[3];
    const callResult = await enhancedCallback(new URL('test://uri'), { a: 'val' });

    expect(callResult.contents).toHaveLength(2);
    expect(callResult.contents[0].text).toBe('original');
    expect(callResult.contents[1].uri).toBe('test://uri/meta');
    expect(callResult.contents[1].text).toContain('# Resource Metadata: Meta Title');
  });
  */
});
