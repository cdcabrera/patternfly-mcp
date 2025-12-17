# Testing MCP Plugin Tools with HTTP Transport

This guide explains how to test MCP plugin tools using the HTTP transport mode, which allows you to read MCP responses programmatically.

## Prerequisites

1. **Build the project** (if not already built):
   ```bash
   npm run build
   ```

2. **Node.js version**: Node.js >= 20.0.0 (Node >= 22 required for external file-based plugins)

## Quick Start

### Step 1: Start the HTTP Server with a Test Plugin

In one terminal, start the server:

```bash
node test-http-server.mjs
```

Or with custom port/host:

```bash
node test-http-server.mjs --port 8080 --host 127.0.0.1
```

The server will:
- Start on `http://127.0.0.1:8080/mcp` (default)
- Register the built-in tools (usePatternFlyDocs, fetchDocs, componentSchemas)
- Register the test plugin tool (`testEcho`)
- Log all activity to stderr

### Step 2: Test the Plugin Tool

In another terminal, run the test client:

```bash
node test-http-client.mjs
```

Or with custom port/host:

```bash
node test-http-client.mjs --port 8080 --host 127.0.0.1
```

The client will:
- Connect to the HTTP server
- List all available tools
- Test the `testEcho` plugin tool
- Test a built-in tool (`usePatternFlyDocs`)
- Display the responses

## What You'll See

### Server Output
```
Starting MCP server with HTTP transport...
  Port: 8080
  Host: 127.0.0.1
  Tool: testEcho (inline)

Server will be available at: http://127.0.0.1:8080/mcp

[info] PatternFly MCP server running on HTTP transport
[info] Registered tool: usePatternFlyDocs
[info] Registered tool: fetchDocs
[info] Registered tool: componentSchemas
[info] Registered tool: testEcho
```

### Client Output
```
Connecting to MCP server at http://127.0.0.1:8080/mcp...

✓ Connected to server

Fetching available tools...

Available tools (4):
  1. usePatternFlyDocs - ...
  2. fetchDocs - ...
  3. componentSchemas - ...
  4. testEcho - Echo back a message with timestamp and metadata...

Testing testEcho tool...
  Input: { message: "Hello from HTTP client!", includeTimestamp: true }

  Response:
{
  "echo": "Hello from HTTP client!",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "received": true,
  "tool": "testEcho"
}
```

## Creating Your Own Plugin Tool

### Option 1: Inline Tool (in test-http-server.mjs)

Modify `test-http-server.mjs` to add your tool:

```javascript
const myTool = createMcpTool({
  name: 'myTool',
  description: 'My custom tool',
  inputSchema: {
    type: 'object',
    properties: {
      input: { type: 'string' }
    },
    required: ['input']
  },
  handler: async (args) => {
    return {
      content: [{
        type: 'text',
        text: `You said: ${args.input}`
      }]
    };
  }
});

// Add to toolModules array:
toolModules: [testTool, myTool]
```

### Option 2: External File-Based Plugin

1. Create a plugin file (e.g., `my-plugin-tool.js`):

```javascript
import { createMcpTool } from './dist/index.js';

export default createMcpTool({
  name: 'myTool',
  description: 'My custom tool',
  inputSchema: {
    type: 'object',
    properties: {
      input: { type: 'string' }
    },
    required: ['input']
  },
  handler: async (args) => {
    return {
      content: [{
        type: 'text',
        text: `You said: ${args.input}`
      }]
    };
  }
});
```

2. Update `test-http-server.mjs` to load it:

```javascript
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const pluginPath = pathToFileURL(resolve(__dirname, 'my-plugin-tool.js')).href;

// In start() call:
toolModules: [pluginPath]
```

**Note**: External file-based plugins require Node.js >= 22.

## Using the MCP SDK Client Directly

You can also create your own client script using the MCP SDK:

```javascript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ResultSchema } from '@modelcontextprotocol/sdk/types.js';

const transport = new StreamableHTTPClientTransport(
  new URL('http://127.0.0.1:8080/mcp')
);

const client = new Client(
  { name: 'my-client', version: '1.0.0' },
  { capabilities: {} }
);

await client.connect(transport);

// Call a tool
const result = await client.request(
  {
    method: 'tools/call',
    params: {
      name: 'testEcho',
      arguments: { message: 'Hello!' }
    }
  },
  ResultSchema
);

console.log(result);
```

## Troubleshooting

### Port Already in Use
If you get a port conflict error:
- Use a different port: `node test-http-server.mjs --port 8081`
- Or stop the process using the port

### Connection Refused
- Make sure the server is running
- Check the host and port match
- Verify firewall settings

### Tool Not Found
- Check that the tool is registered (look at server logs)
- Verify the tool name matches exactly (case-sensitive)
- For file-based plugins, ensure Node.js >= 22

### Module Not Found
- Run `npm run build` first
- Check that `dist/` directory exists
- Verify import paths are correct

## Files Created

- `test-plugin-tool.js` - Example plugin tool (file-based)
- `test-http-server.mjs` - Server startup script with inline plugin
- `test-http-client.mjs` - Client test script

These files are for testing purposes and can be modified or removed as needed.

