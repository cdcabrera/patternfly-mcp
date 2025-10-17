export default (context) => () => [
  'testTool',
  { description: 'A test tool', inputSchema: {} },
  async (args) => ({ content: [{ type: 'text', text: 'Hello' }] })
];

