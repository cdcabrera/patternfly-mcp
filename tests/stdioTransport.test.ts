/**
 *  Requires: npm run build prior to running Jest.
 */
import {
  startServer,
  type StdioTransportClient,
  type RpcRequest
} from './utils/stdioTransportClient';
import { setupFetchMock } from './utils/fetchMock';

describe('PatternFly MCP, STDIO', () => {
  let fetchMock: Awaited<ReturnType<typeof setupFetchMock>> | undefined;
  let client: StdioTransportClient;

  beforeAll(async () => {
    fetchMock = await setupFetchMock({
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
      ]
    });

    client = await startServer();
  });

  afterAll(async () => {
    if (client) {
      await client.close();
    }

    if (fetchMock) {
      await fetchMock.cleanup();
    }
  });

  it('should expose expected tools and stable shape', async () => {
    const response = await client.send({
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

    const response = await client?.send(req);
    const text = response?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text).toMatchSnapshot();
  });

  it('should concatenate headers and separator with two remote files', async () => {
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

    const response = await client.send(req);
    const text = response?.result?.content?.[0]?.text || '';

    // expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text).toMatchSnapshot();
  });
});

describe('Hosted mode, --docs-host', () => {
  let client: StdioTransportClient;

  beforeEach(async () => {
    client = await startServer({ args: ['--docs-host'] });
  });

  afterEach(async () => client.stop());

  it('should read llms-files and includes expected tokens', async () => {
    const req = {
      method: 'tools/call',
      params: {
        name: 'usePatternFlyDocs',
        arguments: { urlList: ['react-core/6.0.0/llms.txt'] }
      }
    };
    const resp = await client.send(req);
    const text = resp?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(text.includes('react-core')).toBe(true);
    expect(text.split(/\n/g).filter(Boolean).splice(1)).toMatchSnapshot();
  });
});

describe('Logging', () => {
  it.each([
    {
      description: 'default',
      args: []
    },
    {
      description: 'stderr',
      args: ['--log-stderr']
    },
    {
      description: 'with log level filtering',
      args: ['--log-level', 'warn']
    },
    {
      description: 'with mcp protocol',
      args: ['--log-protocol']
    }
  ])('should allow setting logging options, $description', async ({ args }) => {
    const serverArgs = [...args];
    const client = await startServer({ args: serverArgs });

    expect(client.logs()).toMatchSnapshot();

    await client.stop();
  });
});
