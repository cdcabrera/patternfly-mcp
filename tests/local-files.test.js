/*
 Developer tests: usePatternFlyDocs with local files
 Requires: npm run build prior to running Jest.
*/

const { startServer } = require('./utils/stdioClient.js');

describe('usePatternFlyDocs (local files)', () => {
  it('concatenates headers and separator with two local files', async () => {
    const client = await startServer();
    try {
      const req = {
        method: 'tools/call',
        params: {
          name: 'usePatternFlyDocs',
          arguments: {
            urlList: [
              'documentation/guidelines/README.md',
              'documentation/components/README.md',
            ],
          },
        },
      };

      const resp = await client.send(req);
      const text = resp?.result?.content?.[0]?.text || '';

      const { SEP, normalizeContentResponse } = global.__TESTS__;
      expect(text.startsWith('# Documentation from')).toBe(true);

      const normalized = normalizeContentResponse(text);
      expect(normalized.headerCount).toBeGreaterThanOrEqual(2);
      expect(normalized.separatorCount).toBe(1);

      expect(normalized).toMatchSnapshot();
    } finally {
      await client.stop();
    }
  });
});
