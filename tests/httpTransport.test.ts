/**
 * Requires: npm run build prior to running Jest.
 */
import { startHttpServer, type HttpTransportClient } from './utils/httpTransportClient';

describe('PatternFly MCP, HTTP Transport', () => {
  let client: HttpTransportClient | undefined;

  // Share server instance across all tests for faster execution
  beforeAll(async () => {
    client = await startHttpServer({ port: 5001, killExisting: true });
  });

  afterAll(async () => {
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
