/*
 Developer tests: --docs-host hosted mode
 Requires: npm run build prior to running Jest.
*/

const { startServer } = require('./utils/stdioClient.js');

describe('--docs-host mode', () => {
  it('reads llms-files and includes expected tokens', async () => {
    const client = await startServer({ args: ['--docs-host'] });
    try {
      const req = {
        method: 'tools/call',
        params: {
          name: 'usePatternFlyDocs',
          arguments: { urlList: ['react-core/6.0.0/llms.txt'] },
        },
      };
      const resp = await client.send(req);
      const text = resp?.result?.content?.[0]?.text || '';

      expect(text.startsWith('# Documentation from')).toBe(true);
      expect(text.includes('react-core')).toBe(true);

      const { normalizeContentResponse } = global.__TESTS__;
      const normalized = normalizeContentResponse(text);
      expect(normalized).toMatchSnapshot();
    } finally {
      await client.stop();
    }
  });
});
