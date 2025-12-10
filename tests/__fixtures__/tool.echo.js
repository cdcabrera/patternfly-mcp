import { createMcpTool } from '../../dist/index.js';

export default createMcpTool([
  {
    name: 'echo_plugin_tool',
    description: 'Echo back the provided args',
    inputSchema: { type: 'object', additionalProperties: true },
    handler: args => ({ ok: true, args })
  }
]);
