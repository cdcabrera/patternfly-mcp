#!/usr/bin/env node

/**
 * Script to test the MCP HTTP server by calling tools
 * 
 * Usage:
 *   node test-http-client.mjs [--port 8080] [--host 127.0.0.1]
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ListToolsResultSchema, ResultSchema } from '@modelcontextprotocol/sdk/types.js';

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

const baseUrl = `http://${host}:${port}/mcp`;

console.log(`Connecting to MCP server at ${baseUrl}...\n`);

// Create MCP client
const transport = new StreamableHTTPClientTransport(new URL(baseUrl));
const client = new Client(
  {
    name: 'test-client',
    version: '1.0.0'
  },
  {
    capabilities: {}
  }
);

// Handle errors
client.onerror = (error) => {
  console.error('Client error:', error);
};

try {
  // Connect to server
  await client.connect(transport);
  console.log('✓ Connected to server\n');

  // List available tools
  console.log('Fetching available tools...');
  const toolsList = await client.request(
    { method: 'tools/list', params: {} },
    ListToolsResultSchema
  );
  
  console.log(`\nAvailable tools (${toolsList.tools.length}):`);
  toolsList.tools.forEach((tool, index) => {
    console.log(`  ${index + 1}. ${tool.name} - ${tool.description}`);
  });
  console.log('');

  // Test the testEcho tool
  const testTool = toolsList.tools.find(t => t.name === 'testEcho');
  
  if (testTool) {
    console.log('Testing testEcho tool...');
    console.log('  Input: { message: "Hello from HTTP client!", includeTimestamp: true }');
    
    const result = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'testEcho',
          arguments: {
            message: 'Hello from HTTP client!',
            includeTimestamp: true
          }
        }
      },
      ResultSchema
    );

    console.log('\n  Response:');
    if (result.content && result.content[0]?.text) {
      try {
        const parsed = JSON.parse(result.content[0].text);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(result.content[0].text);
      }
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } else {
    console.log('⚠ testEcho tool not found. Available tools:', toolsList.tools.map(t => t.name).join(', '));
  }

  // Test a built-in tool (usePatternFlyDocs)
  const builtInTool = toolsList.tools.find(t => t.name === 'usePatternFlyDocs');
  
  if (builtInTool) {
    console.log('\n\nTesting built-in usePatternFlyDocs tool...');
    console.log('  Input: { urlList: ["documentation/guidelines/README.md"] }');
    
    const result = await client.request(
      {
        method: 'tools/call',
        params: {
          name: 'usePatternFlyDocs',
          arguments: {
            urlList: ['documentation/guidelines/README.md']
          }
        }
      },
      ResultSchema
    );

    console.log('\n  Response (first 500 chars):');
    if (result.content && result.content[0]?.text) {
      const text = result.content[0].text;
      console.log(text.substring(0, 500) + (text.length > 500 ? '...' : ''));
    }
  }

  console.log('\n✓ Tests completed successfully\n');

} catch (error) {
  console.error('Error:', error);
  process.exit(1);
} finally {
  // Clean up
  await transport.close();
  console.log('Disconnected from server');
}

