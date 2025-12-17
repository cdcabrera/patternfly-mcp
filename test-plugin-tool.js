import { createMcpTool } from './dist/index.js';

/**
 * Test tool plugin for HTTP MCP server testing
 * This tool accepts a message and returns a formatted response
 */
export default createMcpTool({
  name: 'testEcho',
  description: 'Echo back a message with timestamp and metadata. Useful for testing MCP plugin functionality.',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The message to echo back'
      },
      includeTimestamp: {
        type: 'boolean',
        description: 'Whether to include a timestamp in the response',
        default: true
      }
    },
    required: ['message']
  },
  handler: async (args) => {
    const { message, includeTimestamp = true } = args;
    const timestamp = includeTimestamp ? new Date().toISOString() : null;
    
    const response = {
      echo: message,
      ...(timestamp && { timestamp }),
      received: true,
      tool: 'testEcho'
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }
});

