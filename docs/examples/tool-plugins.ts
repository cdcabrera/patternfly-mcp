/**
 * Tool Plugins Example
 * 
 * This example demonstrates how to create and use custom tool plugins
 * with the PatternFly MCP Server.
 */

import { start, createMcpTool, type ToolModule } from '@patternfly/patternfly-mcp';

// Example 1: Single tool module
const helloTool: ToolModule = createMcpTool({
  name: 'hello',
  description: 'Say hello to someone',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'The name of the person to greet'
      }
    },
    required: ['name']
  },
  async handler({ name }: { name: string }) {
    return {
      text: `Hello, ${name}!`
    };
  }
});

// Example 2: Multiple tools in one module
const greetingTools: ToolModule = createMcpTool([
  {
    name: 'greet',
    description: 'Greet someone',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' }
      },
      required: ['name']
    },
    handler: async ({ name }: { name: string }) => ({
      text: `Greetings, ${name}!`
    })
  },
  {
    name: 'farewell',
    description: 'Say goodbye',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' }
      },
      required: ['name']
    },
    handler: async ({ name }: { name: string }) => ({
      text: `Goodbye, ${name}!`
    })
  }
]);

// Example 3: Using Zod schema
import { z } from 'zod';

const zodTool: ToolModule = createMcpTool({
  name: 'zod-example',
  description: 'Example using Zod schema',
  inputSchema: {
    name: z.string().min(1),
    age: z.number().int().positive().optional()
  },
  async handler({ name, age }: { name: string; age?: number }) {
    return {
      text: age
        ? `${name} is ${age} years old`
        : `Hello, ${name}!`
    };
  }
});

async function main() {
  console.log('Starting server with custom tools...');

  // Start server with custom tool modules
  const server = await start({
    toolModules: [
      helloTool,
      greetingTools,
      zodTool
    ]
  });

  console.log('Server started with custom tools!');
  console.log(`Server is running: ${server.isRunning()}`);

  // Get server statistics
  const stats = await server.getStats();
  console.log('Server stats:', stats);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await server.stop();
    process.exit(0);
  });

  console.log('Server is running. Press Ctrl+C to stop.');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
