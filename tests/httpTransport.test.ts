/**
 * Requires: npm run build prior to running Jest.
 */
import {
  startHttpServer,
  type RpcRequest
} from './utils/httpTransportClient';
import { loadFixture } from './utils/fixtures';
import { setupFetchMock } from './utils/fetchMock';

describe('PatternFly MCP, HTTP Transport', () => {
  let fetchMock: Awaited<ReturnType<typeof setupFetchMock>> | undefined;

  beforeAll(async () => {
    // Load fixture content
    const body = loadFixture('README.md');

    // Set up fetch mock with routes
    fetchMock = await setupFetchMock({
      routes: [
        {
          url: /\/readme$/,
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body
        },
        {
          url: /.*\.md$/,
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body: '# Test Document\n\nThis is a test document for mocking remote HTTP requests.'
        }
      ],
      excludePorts: [5001] // Don't intercept MCP server requests
    });

    // Start the MCP server
    // client = await startHttpServer({ http: { port: 5001 } });
  });

  afterAll(async () => {
    // Cleanup fetch mock (restores fetch and closes fixture server)
    if (fetchMock) {
      await fetchMock.cleanup();
    }

    // Close MCP server
    /*
    if (client) {
      await client.close();
      client = undefined;
    }
    */
  });

  it('should initialize MCP session over HTTP', async () => {
    const client = await startHttpServer({ http: { port: 5001 } });
    const response = await client.initialize();

    expect({
      version: response?.result?.protocolVersion,
      name: (response as any)?.result?.serverInfo?.name,
      baseUrl: client.baseUrl
    }).toMatchSnapshot();
    await client.close();
  });

  it('should expose expected tools and stable shape', async () => {
    const client = await startHttpServer({ http: { port: 5001 } });
    const response = await client.send({
      method: 'tools/list',
      params: {}
    });
    const tools = response?.result?.tools || [];
    const toolNames = tools.map((tool: any) => tool.name).sort();

    expect({
      toolNames
    }).toMatchSnapshot();
    await client.close();
  });

  it('should concatenate headers and separator with two local files', async () => {
    const client = await startHttpServer({ http: { port: 5001 } });
    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'usePatternFlyDocs',
        arguments: {
          urlList: [
            'documentation/guidelines/README.md',
            'documentation/components/README.md'
          ]
        }
      }
    } as RpcRequest;

    const response = await client.send(req);
    const text = response?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text).toMatchSnapshot();
    await client.close();
  });
});
