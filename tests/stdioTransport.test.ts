/**
 *  Requires: npm run build prior to running Jest.
 */

import { startServer, type StdioTransportClient } from './utils/stdioTransportClient';
import { loadFixture } from './utils/httpFixtureServer';
import { setupFetchMock } from './jest.setupHelpers';

describe('PatternFly MCP, STDIO', () => {
  let client: StdioTransportClient;

  beforeEach(async () => {
    client = await startServer();
  });

  afterEach(async () => client.stop());

  it('should concatenate headers and separator with two local files', async () => {
    const req = {
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

  it('should expose expected tools and stable shape', async () => {
    const response = await client.send({ method: 'tools/list' });
    const tools = response?.result?.tools || [];
    const toolNames = tools.map((tool: any) => tool.name).sort();

    expect(toolNames).toEqual(expect.arrayContaining(['usePatternFlyDocs', 'fetchDocs']));
    expect({ toolNames }).toMatchSnapshot();
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

describe('External URLs', () => {
  let fetchMock: Awaited<ReturnType<typeof setupFetchMock>> | undefined;
  let url: string;
  let client: StdioTransportClient;

  beforeEach(async () => {
    client = await startServer();
  });

  afterEach(async () => client.stop());

  beforeAll(async () => {
    const body = loadFixture('README.md');

    // Use fetch mock helper to set up fixture server
    // Note: The MCP server runs in a child process, so fetch mocking in the test process
    // won't affect it. However, we use the fixture server URL directly, so the helper
    // still simplifies fixture server setup/cleanup.
    // The helper creates index-based paths (/0, /1, etc.), so we use /0 for the first route
    fetchMock = await setupFetchMock({
      routes: [
        {
          url: /\/readme$/,
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body
        }
      ]
    });
    // Use the fixture server URL with index-based path (child process will make real fetch to it)
    url = `${fetchMock.fixture.baseUrl}/0`;
  });

  afterAll(async () => {
    // Cleanup fetch mock (closes fixture server)
    if (fetchMock) {
      await fetchMock.cleanup();
    }
  });

  it('should fetch a document', async () => {
    const req = {
      method: 'tools/call',
      params: { name: 'fetchDocs', arguments: { urlList: [url] } }
    };
    const resp = await client.send(req, { timeoutMs: 10000 });
    const text = resp?.result?.content?.[0]?.text || '';

    expect(text.startsWith('# Documentation from')).toBe(true);
    expect(/patternfly/i.test(text)).toBe(true);
    expect(text.split(/\n/g).filter(Boolean).splice(1)).toMatchSnapshot();
  });
});
