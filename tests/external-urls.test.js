/*
 Developer tests: fetchDocs external URL via local HTTP fixture
 Requires: npm run build prior to running Jest.
*/

const { startServer } = require('./utils/stdioClient.js');
const { startHttpFixture, loadFixture } = require('./utils/httpFixtureServer.js');

describe('fetchDocs using local HTTP fixture (offline)', () => {
  let fixture;
  let url;

  beforeAll(async () => {
    const body = loadFixture('README.md');
    fixture = await startHttpFixture({
      routes: {
        '/readme': {
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body,
        },
      },
    });
    url = `${fixture.baseUrl}/readme`;
  });

  afterAll(async () => {
    await fixture.close();
  });

  test('fetches local fixture doc and matches normalized snapshot', async () => {
    const client = await startServer();
    try {
      const req = {
        method: 'tools/call',
        params: { name: 'fetchDocs', arguments: { urls: [url] } },
      };
      const resp = await client.send(req, { timeoutMs: 10000 });
      const text = resp?.result?.content?.[0]?.text || '';

      expect(text.startsWith('# Documentation from')).toBe(true);
      expect(/patternfly/i.test(text)).toBe(true);

      const { normalizeContentResponse } = global.__TESTS__;
      const normalized = normalizeContentResponse(text);
      expect(normalized).toMatchSnapshot();
    } finally {
      await client.stop();
    }
  });
});
