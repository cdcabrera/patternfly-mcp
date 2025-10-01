/*
 Developer tests: tools/list
 Requires: npm run build prior to running Jest.
*/

const { startServer } = require('./utils/stdioClient.js');

describe('tools/list', () => {
  it('exposes expected tools and stable shape', async () => {
    const client = await startServer();
    try {
      const resp = await client.send({ method: 'tools/list' });
      const tools = resp?.result?.tools || [];
      const toolNames = tools.map(t => t.name).sort();

      // Presence assertions
      expect(toolNames).toEqual(expect.arrayContaining(['usePatternFlyDocs', 'fetchDocs', 'clearCache']));

      // Snapshot a minimal, stable shape
      expect({ toolNames }).toMatchSnapshot();
    } finally {
      await client.stop();
    }
  });
});
