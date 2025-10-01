/*
 Developer tests: fetchDocs external URL (opt-in)
 Requires: npm run build prior to running Jest.
 Enable with: E2E_INCLUDE_EXTERNAL=1 or provide TEST_EXTERNAL_URL
*/

const { startServer } = require('./utils/stdioClient.js');

const includeExternal = process.env.E2E_INCLUDE_EXTERNAL === '1' || !!process.env.TEST_EXTERNAL_URL;

(includeExternal ? describe : describe.skip)('fetchDocs external URL (opt-in)', () => {
  test('fetches a stable remote doc and matches normalized snapshot', async () => {
    const client = await startServer();
    try {
      const url = process.env.TEST_EXTERNAL_URL || 'https://raw.githubusercontent.com/patternfly/patternfly-org/main/README.md';
      const req = {
        method: 'tools/call',
        params: { name: 'fetchDocs', arguments: { urls: [url] } },
      };
      const resp = await client.send(req, { timeoutMs: 30000 });
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
