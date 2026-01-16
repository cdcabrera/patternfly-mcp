/**
 * Embedding Example
 * 
 * This example demonstrates how to embed the PatternFly MCP Server
 * inside your application with custom tools.
 */

import { start, createMcpTool, type PfMcpInstance, type ToolModule } from '@patternfly/patternfly-mcp';

// Create a custom tool for your application
const echoTool: ToolModule = createMcpTool({
  name: 'echoAMessage',
  description: 'Echo back the provided user message.',
  inputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description: 'The message to echo back'
      }
    },
    required: ['message']
  },
  handler: async (args: { message: string }) => {
    return {
      text: `You said: ${args.message}`
    };
  }
});

// Create another custom tool
const calculatorTool: ToolModule = createMcpTool({
  name: 'calculate',
  description: 'Perform basic arithmetic operations',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['add', 'subtract', 'multiply', 'divide'],
        description: 'The arithmetic operation to perform'
      },
      a: {
        type: 'number',
        description: 'First number'
      },
      b: {
        type: 'number',
        description: 'Second number'
      }
    },
    required: ['operation', 'a', 'b']
  },
  handler: async ({ operation, a, b }: { operation: string; a: number; b: number }) => {
    let result: number;
    switch (operation) {
      case 'add':
        result = a + b;
        break;
      case 'subtract':
        result = a - b;
        break;
      case 'multiply':
        result = a * b;
        break;
      case 'divide':
        if (b === 0) {
          throw new Error('Division by zero');
        }
        result = a / b;
        break;
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
    return {
      text: `${a} ${operation} ${b} = ${result}`
    };
  }
});

async function main() {
  console.log('Embedding PatternFly MCP Server...');

  // Start server with custom tools
  const server: PfMcpInstance = await start({
    toolModules: [
      echoTool,
      calculatorTool
    ],
    logging: {
      stderr: true,
      level: 'info'
    }
  });

  console.log('Server embedded successfully!');
  console.log(`Server is running: ${server.isRunning()}`);

  // Optional: Observe refined server logs in-process
  server.onLog((event) => {
    if (event.level !== 'debug') {
      console.warn(`[${event.level}] ${event.msg || ''}`);
    }
  });

  // Get server statistics
  const stats = await server.getStats();
  console.log('Server statistics:', stats);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down embedded server...');
    await server.stop();
    console.log('Server stopped.');
    process.exit(0);
  });

  // Example: Your application logic here
  console.log('Your application is running with embedded MCP server.');
  console.log('Press Ctrl+C to stop.');

  // Keep process alive
  // In a real application, you would have your application logic here
}

main().catch((error) => {
  console.error('Failed to embed server:', error);
  process.exit(1);
});
