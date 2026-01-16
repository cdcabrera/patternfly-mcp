import { createMcpTool } from '@patternfly/patternfly-mcp';

/**
 * Example of authoring a custom tool.
 *
 * To load this tool into the PatternFly MCP server:
 * 1. Save this file (e.g., `my-custom-tool.js`)
 * 2. Run the server with: `npx @patternfly/patternfly-mcp --tool ./my-custom-tool.js`
 *
 * Note: External tool loading requires Node.js >= 22.
 */
export default createMcpTool({
  name: 'helloWorld',
  description: 'A simple example tool that greets the user.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The name of the person to greet.'
      }
    },
    required: ['name']
  },
  async handler({ name }) {
    return {
      content: [
        {
          type: 'text',
          text: `Hello, ${name}! Welcome to the PatternFly MCP ecosystem.`
        }
      ]
    };
  }
});
