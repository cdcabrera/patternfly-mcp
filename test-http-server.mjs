#!/usr/bin/env node

/**
 * Script to start the MCP server with HTTP transport and a test plugin tool
 * 
 * Usage:
 *   node test-http-server.mjs [--port 8080] [--host 127.0.0.1]
 */

import { start } from './dist/index.js';
import { createMcpTool } from './dist/index.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Parse CLI arguments
const args = process.argv.slice(2);
const portIndex = args.indexOf('--port');
const hostIndex = args.indexOf('--host');

const port = portIndex >= 0 && args[portIndex + 1] 
  ? parseInt(args[portIndex + 1], 10) 
  : 8080;

const host = hostIndex >= 0 && args[hostIndex + 1]
  ? args[hostIndex + 1]
  : '127.0.0.1';

// Create a test tool inline (alternative to loading from file)
const testTool = createMcpTool({
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

// Alternative: Load tool from file (uncomment to use)
// const testToolPath = resolve(__dirname, 'test-plugin-tool.js');
// const testTool = testToolPath;

console.log(`Starting MCP server with HTTP transport...`);
console.log(`  Port: ${port}`);
console.log(`  Host: ${host}`);
console.log(`  Tool: testEcho (inline)`);
console.log(`\nServer will be available at: http://${host}:${port}/mcp`);
console.log(`\nPress Ctrl+C to stop the server\n`);

// Start the server
const server = await start({
  mode: 'programmatic',
  isHttp: true,
  http: {
    port,
    host,
    allowedOrigins: ['http://localhost:*', 'http://127.0.0.1:*'],
    allowedHosts: ['localhost', '127.0.0.1']
  },
  logging: {
    level: 'info',
    stderr: true,
    protocol: false
  },
  toolModules: [testTool]
}, {
  allowProcessExit: true
});

// Log server events
server.onLog((event) => {
  if (event.level !== 'debug') {
    console.error(`[${event.level}] ${event.msg || ''}`);
  }
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down server...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down server...');
  await server.stop();
  process.exit(0);
});

