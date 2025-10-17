
      export default (context) => {
        return () => [
          'verboseTool',
          { description: 'verbose', inputSchema: {} },
          async (args) => ({ content: [] })
        ];
      };
      export const metadata = { name: 'test-plugin', version: '1.0.0' };
    