import { start, createMcpTool } from '@patternfly/patternfly-mcp';

/**
 * Example of embedding the PatternFly MCP server and registering
 * an inline tool.
 */
async function main() {
  const customTool = createMcpTool({
    name: 'echo',
    description: 'Echo back a message.',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      },
      required: ['message']
    },
    async handler({ message }) {
      return {
        content: [{ type: 'text', text: `Echo: ${message}` }]
      };
    }
  });

  const server = await start({
    toolModules: [customTool]
  });

  // Avoid using console.log and info they pollute STDOUT.
  console.warn('Server started with inline tool: "echo"');

  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}

main().catch(console.error);
