/**
 * Requires: npm run build prior to running Jest.
 */
import { startHttpServer, type HttpTransportClient } from './utils/httpTransportClient';
import { loadFixture, startHttpFixture } from './utils/httpFixtureServer';

describe('PatternFly MCP, HTTP Transport', () => {
  let client: HttpTransportClient | undefined;
  let fixture: { baseUrl: string; close: () => Promise<void> } | undefined;
  let originalFetch: typeof global.fetch;

  // Set up fixture server to mock remote HTTP requests
  // This ensures tests don't depend on external services being available
  beforeAll(async () => {
    // Start fixture server with mock content
    const body = loadFixture('README.md');
    fixture = await startHttpFixture({
      routes: {
        '/readme': {
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body
        },
        '/test-doc': {
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body: '# Test Document\n\nThis is a test document for mocking remote HTTP requests.'
        }
      }
    });

    // Mock global.fetch to intercept remote HTTP requests and route them to fixture server
    originalFetch = global.fetch;
    global.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      
      // Only intercept remote URLs that are NOT the MCP server endpoint
      // MCP server runs on port 5001, so we skip those requests
      if ((url.startsWith('http://') || url.startsWith('https://')) && !url.includes(':5001')) {
        // Extract the path from the original URL or use a default
        const urlObj = new URL(url);
        const fixturePath = urlObj.pathname || '/test-doc';
        // Fixture is guaranteed to exist here since it's set in beforeAll
        const fixtureUrl = `${fixture!.baseUrl}${fixturePath}`;
        
        // Use original fetch to hit the fixture server
        return originalFetch(fixtureUrl, init);
      }
      
      // For non-HTTP URLs (like file://), use original fetch
      return originalFetch(input as RequestInfo, init);
    };

    // Start the MCP server
    client = await startHttpServer({ port: 5001, killExisting: true });
  });

  afterAll(async () => {
    // Restore original fetch
    if (originalFetch) {
      global.fetch = originalFetch;
    }

    // Close fixture server
    if (fixture) {
      await fixture.close();
    }

    // Close MCP server
    if (client) {
      await client.close();
      client = undefined;
    }
  });

  it('should expose expected tools and stable shape', async () => {
    // Client is automatically initialized, so we can directly call tools/list
    if (!client) throw new Error('Client not initialized');
    const response = await client.send({
      method: 'tools/list',
      params: {}
    });
    const tools = response?.result?.tools || [];
    const toolNames = tools.map((tool: any) => tool.name).sort();

    expect(toolNames).toMatchSnapshot();
  });

  /*
  it('should initialize MCP session over HTTP', async () => {
    client = await startHttpServer({ port: 5001, killExisting: true });
    const response = await client.initialize();

    expect({
      version: response?.result?.protocolVersion,
      name: (response as any)?.result?.serverInfo?.name
    }).toMatchSnapshot();
  });

  it('should concatenate headers and separator with two local files', async () => {
    client = await startHttpServer({ port: 5001, killExisting: true });
    const req: RpcRequest = {
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
    };

    const response = await client.send(req);
    const text = response?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text).toMatchSnapshot();
  });

  it('should start server on custom host', async () => {
    client = await startHttpServer({ port: 5001, killExisting: true });
    await client.close();
    client = await startHttpServer({ host: '127.0.0.1', port: 5011 });

    expect(client.baseUrl).toMatch(/127\.0\.0\.1/);
  });
   */
});
