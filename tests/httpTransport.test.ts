/**
 * Requires: npm run build prior to running Jest.
 */
// @ts-ignore - dist/index.js isn't necessarily built yet, remember to build before running tests
import { createMcpTool } from '../dist/index.js';
import {
  startServer,
  type HttpTransportClient,
  type RpcRequest
} from './utils/httpTransportClient';
import { setupFetchMock } from './utils/fetchMock';

describe('PatternFly MCP, HTTP Transport', () => {
  let FETCH_MOCK: Awaited<ReturnType<typeof setupFetchMock>> | undefined;
  let CLIENT: HttpTransportClient | undefined;

  beforeAll(async () => {
    FETCH_MOCK = await setupFetchMock({
      routes: [
        {
          url: /\/README\.md$/,
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body: `# PatternFly Development Rules
            This is a generated offline fixture used by the MCP external URLs test.

            Essential rules and guidelines working with PatternFly applications.

            ## Quick Navigation

            ### 🚀 Setup & Environment
            - **Setup Rules** - Project initialization requirements
            - **Quick Start** - Essential setup steps
            - **Environment Rules** - Development configuration`
        },
        {
          url: /.*\.md$/,
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body: '# Test Document\n\nThis is a test document for mocking remote HTTP requests.'
        }
      ],
      excludePorts: [5001]
    });

    CLIENT = await startServer({ http: { port: 5001 } });
  });

  afterAll(async () => {
    if (CLIENT) {
      // You may still receive jest warnings about a running process, but clean up case we forget at the test level.
      await CLIENT.close();
      CLIENT = undefined;
    }

    if (FETCH_MOCK) {
      await FETCH_MOCK.cleanup();
    }
  });

  it('should initialize MCP session over HTTP', async () => {
    const response = await CLIENT?.initialize();

    expect({
      version: response?.result?.protocolVersion,
      name: (response as any)?.result?.serverInfo?.name,
      baseUrl: CLIENT?.baseUrl
    }).toMatchSnapshot();
  });

  it('should expose expected tools and stable shape', async () => {
    const response = await CLIENT?.send({
      method: 'tools/list',
      params: {}
    });
    const tools = response?.result?.tools || [];
    const toolNames = tools.map((tool: any) => tool.name).sort();

    expect({ toolNames }).toMatchSnapshot();
  });

  it('should concatenate headers and separator with two local files', async () => {
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

    const response = await CLIENT?.send(req);
    const text = response?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text).toMatchSnapshot();
  });

  it('should concatenate headers and separator with two remote files', async () => {
    const CLIENT = await startServer({ http: { port: 5002 } });
    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'fetchDocs',
        arguments: {
          urlList: [
            'https://www.patternfly.org/notARealPath/README.md',
            'https://www.patternfly.org/notARealPath/AboutModal.md'
          ]
        }
      }
    } as RpcRequest;

    const response = await CLIENT.send(req);
    const text = response?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text).toMatchSnapshot();
    CLIENT.close();
  });
});

describe('Inline tools over HTTP', () => {
  let CLIENT: HttpTransportClient | undefined;

  afterAll(async () => {
    if (CLIENT) {
      await CLIENT.close();
    }
  });

  it('registers and invokes an inline JSON-schema tool', async () => {
    const inline = createMcpTool({
      name: 'inline_echo',
      description: 'Echo inline',
      inputSchema: { type: 'object', additionalProperties: true },
      handler: (args: any) => ({ content: [{ type: 'text', text: JSON.stringify(args) }] })
    });

    CLIENT = await startServer({ http: { port: 5012 }, logging: { level: 'info' }, isHttp: true }, { allowProcessExit: false });

    // Merge inline tool via programmatic options (rely on DEFAULT_OPTIONS merge behavior)
    // We can’t alter options after start in these helpers; instead start a new server instance including inline:
    if (CLIENT) {
      await CLIENT.close();
    }

    CLIENT = await startServer(
      { http: { port: 5013 }, logging: { level: 'info' }, isHttp: true, toolModules: [inline] },
      { allowProcessExit: false }
    );

    const list = await CLIENT.send({ method: 'tools/list', params: {} });
    const names = (list?.result?.tools || []).map((tool: any) => tool.name);

    expect(names).toEqual(expect.arrayContaining(['inline_echo']));

    const req = {
      jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'inline_echo', arguments: { x: 1, y: 'z' } }
    } as RpcRequest;

    const res = await CLIENT.send(req);

    expect(res?.result?.content?.[0]?.text).toContain('"x":1');
  });
});
