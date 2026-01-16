# Usage Guide

Complete guide to using the PatternFly MCP Server, including CLI usage, programmatic API, tools, resources, and configuration.

## Table of Contents

- [CLI Usage](#cli-usage)
- [Programmatic Usage](#programmatic-usage)
- [Built-in Tools](#built-in-tools)
- [Built-in Resources](#built-in-resources)
- [MCP Client Configuration](#mcp-client-configuration)
- [Initial Troubleshooting](#initial-troubleshooting)

## CLI Usage

### Basic Commands

**stdio mode (default):**
```bash
npx @patternfly/patternfly-mcp
```

**HTTP mode:**
```bash
npx @patternfly/patternfly-mcp --http --port 8080
```

### CLI Options

#### HTTP Transport Options

- `--http`: Enable HTTP transport mode (default: stdio)
- `--port <number>`: Port to listen on (default: 8080)
- `--host <string>`: Host to bind to (default: 127.0.0.1)
- `--allowed-origins <origins>`: Comma-separated list of allowed CORS origins
- `--allowed-hosts <hosts>`: Comma-separated list of allowed host headers

**DNS Rebinding Protection**: This server enables DNS rebinding protection by default when running in HTTP mode. If you're behind a proxy or load balancer, ensure the client sends a correct `Host` header and configure `--allowed-hosts` accordingly.

**Example:**
```bash
npx @patternfly/patternfly-mcp --http \
  --port 3000 \
  --allowed-origins "https://app.com" \
  --allowed-hosts "localhost,127.0.0.1"
```

#### Logging Options

- `--log-stderr`: Enable terminal logging
- `--log-protocol`: Forward logs to MCP clients (requires advertising `capabilities.logging`)
- `--log-level <level>`: Set log level (`debug`, `info`, `warn`, `error`). Default: `info`
- `--verbose`: Shortcut for `debug` level

The server uses a `diagnostics_channel`–based logger that keeps STDIO stdout pure by default. No terminal output occurs unless you enable a sink.

**Example:**
```bash
npx @patternfly/patternfly-mcp --log-stderr --log-level debug
```

#### Tool Plugin Options

- `--tool <path|package>`: Load one or more plugins. You can provide a path to a local file or the name of an installed NPM package.
  - *Examples*: `--tool @acme/my-plugin`, `--tool ./local-plugins/weather-tool.js`, `--tool ./a.js,./b.js`
- `--plugin-isolation <none|strict>`: Tools Host permission preset.
  - **Default**: `strict`. In strict mode, network and filesystem write access are denied; fs reads are allow‑listed to your project and resolved plugin directories.

**Behavior and Limitations:**
- **Node version gate**: Node < 22 skips loading plugins from external sources with a warning; built‑ins still register.
- **Supported inputs**: ESM packages (installed in `node_modules`) and local ESM files with default exports.
- **Not supported**: Raw TypeScript sources (`.ts`) or remote `http(s):` URLs.

**Example:**
```bash
npx @patternfly/patternfly-mcp --tool ./my-tool.js --plugin-isolation strict
```

#### Disabled Options

- `--docs-host`: **Disabled** - This flag produces no results. Docs-host mode will be removed or replaced in a future release.

### Environment Variables

- `DOC_MCP_FETCH_TIMEOUT_MS`: Milliseconds to wait before aborting an HTTP fetch (default: 15000)

## Programmatic Usage

### Embedding the Server

You can embed the MCP server inside your application using the `start()` function and provide **Tool Modules** directly.

```ts
import { start, createMcpTool, type PfMcpInstance, type ToolModule } from '@patternfly/patternfly-mcp';

const echoTool: ToolModule = createMcpTool({
  name: 'echoAMessage',
  description: 'Echo back the provided user message.',
  inputSchema: {
    type: 'object',
    properties: { message: { type: 'string' } },
    required: ['message']
  },
  handler: async (args: { message: string }) => ({ text: `You said: ${args.message}` })
});

async function main() {
  const server: PfMcpInstance = await start({
    toolModules: [
      echoTool
    ]
  });

  // Optional: observe refined server logs in‑process
  server.onLog((event) => {
    if (event.level !== 'debug') {
      console.warn(`[${event.level}] ${event.msg || ''}`);
    }
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}

main();
```

See [examples/](examples/) for more programmatic usage examples.

## Built-in Tools

The MCP server tools are focused on being a resource library for PatternFly. Server tools are extensible by design and intended to be used in conjunction with the available MCP resources.

### Tool: searchPatternFlyDocs

Use this to search for PatternFly documentation URLs and component names. Accepts partial string matches or `*` to list all available components. From the content, you can select specific URLs and component names to use with `usePatternFlyDocs`.

**Parameters:**
- `searchQuery`: `string` (required) - Full or partial component name to search for (e.g., "button", "table", "*")

**Example:**
```json
{
  "searchQuery": "button"
}
```

### Tool: usePatternFlyDocs

Fetch full documentation and component JSON schemas for specific PatternFly URLs or component names.

> **Feature**: This tool automatically detects if a URL belongs to a component (or if a "name" is provided) and appends its machine-readable JSON schema (props, types, validation) to the response, providing a fused context of human-readable docs and technical specs.

**Parameters:** _Parameters are mutually exclusive. Provide either `name` OR `urlList` not both._
- `name`: `string` (optional) - The name of the PatternFly component (e.g., "Button", "Modal"). **Recommended** for known component lookups.
- `urlList`: `string[]` (optional) - A list of specific documentation URLs discovered via `searchPatternFlyDocs` (max 15 at a time).

**Example with name:**
```json
{
  "name": "Button"
}
```

**Example with urlList:**
```json
{
  "urlList": ["https://patternfly.org/components/button"]
}
```

### Deprecated Tools

#### ~~Tool: fetchDocs~~ (Removed)
> "fetchDocs" has been integrated into "usePatternFlyDocs."

#### ~~Tool: componentSchemas~~ (Deprecated)
> "componentSchemas" has been integrated into "usePatternFlyDocs."

## Built-in Resources

The server exposes a resource-centric architecture via the `patternfly://` URI scheme:

- **`patternfly://context`**: General PatternFly development context and high-level rules.
- **`patternfly://docs/index`**: Index of all available documentation pages.
- **`patternfly://docs/{name}`**: Documentation for a specific component (e.g., `patternfly://docs/Button`).
- **`patternfly://schemas/index`**: Index of all available component schemas.
- **`patternfly://schemas/{name}`**: JSON Schema for a specific component (e.g., `patternfly://schemas/Button`).

## MCP Client Configuration

Most MCP clients use a JSON configuration to specify how to start this server. Below are examples you can adapt to your MCP client.

### Minimal client config (stdio)

```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "npx",
      "args": ["-y", "@patternfly/patternfly-mcp@latest"],
      "description": "PatternFly React development rules and documentation"
    }
  }
}
```

### HTTP transport mode

```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "npx",
      "args": ["-y", "@patternfly/patternfly-mcp@latest", "--http", "--port", "8080"],
      "description": "PatternFly docs (HTTP transport)"
    }
  }
}
```

### Custom local tool

```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "npx",
      "args": [
        "-y",
        "@patternfly/patternfly-mcp@latest",
        "--tool",
        "./mcp-tools/local-custom-tool.js"
      ],
      "description": "PatternFly MCP with a local custom tool"
    }
  }
}
```

### HTTP mode with security

```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "npx",
      "args": [
        "-y",
        "@patternfly/patternfly-mcp@latest",
        "--http",
        "--port",
        "3000",
        "--allowed-origins",
        "https://app.com",
        "--allowed-hosts",
        "localhost,127.0.0.1"
      ],
      "description": "PatternFly docs (HTTP transport with security)"
    }
  }
}
```

## MCP Tool Plugins

You can extend the server's capabilities by loading **Tool Plugins** at startup. These plugins run out‑of‑process in an isolated **Tools Host** (Node.js >= 22) to ensure security and stability.

### Terminology

- **`Tool`**: The low-level tuple format `[name, schema, handler]`.
- **`Tool Config`**: The authoring object format `{ name, description, inputSchema, handler }`.
- **`Tool Factory`**: A function wrapper `(options) => Tool` (internal).
- **`Tool Module`**: The programmatic result of `createMcpTool`, representing a collection of tools.

### Authoring Tools

We recommend using the `createMcpTool` helper to define tools. It ensures your tools are properly normalized for the server.

#### Authoring a single Tool Module

```ts
import { createMcpTool } from '@patternfly/patternfly-mcp';

export default createMcpTool({
  name: 'hello',
  description: 'Say hello',
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name']
  },
  async handler({ name }) {
    return `Hello, ${name}!`;
  }
});
```

#### Authoring multiple tools in one module

```ts
import { createMcpTool } from '@patternfly/patternfly-mcp';

export default createMcpTool([
  { name: 'hi', description: 'Greets', inputSchema: {}, handler: () => 'hi' },
  { name: 'bye', description: 'Farewell', inputSchema: {}, handler: () => 'bye' }
]);
```

#### Input Schema Format

The `inputSchema` property accepts either **plain JSON Schema objects** or **Zod schemas**. Both formats are automatically converted to the format required by the MCP SDK.

**JSON Schema (recommended):**
```ts
inputSchema: {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'number' }
  },
  required: ['name']
}
```

**Zod Schema:**
```ts
import { z } from 'zod';

inputSchema: {
  name: z.string(),
  age: z.number().optional()
}
```

See [examples/tool-plugins.ts](examples/tool-plugins.ts) for more examples.

## Initial Troubleshooting

### Tool Plugins

- **Plugins don't appear**: Verify the Node version (requires Node.js >= 22) and check logs (enable `--log-stderr`).
- **Startup warnings/errors**: Startup `load:ack` warnings/errors from tool plugins are logged when stderr/protocol logging is enabled.
- **Schema errors**: If `tools/call` rejects with schema errors, ensure `inputSchema` is valid. See [Authoring Tools](#authoring-tools) for details.
- **Network access issues**: If the tool is having network access issues, you may need to configure `--plugin-isolation none`. This is generally discouraged for security reasons but may be necessary in some cases.

### HTTP Transport

- **Connection issues**: Ensure the port is not already in use and the host is correct.
- **CORS errors**: Configure `--allowed-origins` if accessing from a web client.
- **DNS rebinding protection**: If behind a proxy, ensure correct `Host` header and configure `--allowed-hosts`.

### General Issues

- **Server won't start**: Check Node.js version (requires >= 20.0.0, >= 22.0.0 for tool plugins).
- **Missing tools/resources**: Verify the server started successfully and check logs with `--log-stderr`.
- **Type errors**: Ensure TypeScript types are installed: `npm install --save-dev @types/node`

For more detailed troubleshooting, check the [Architecture documentation](architecture.md) or open an issue on GitHub.

## Inspector-CLI Examples

You can test the server using the MCP Inspector CLI:

```bash
npx @modelcontextprotocol/inspector-cli \
  --config ./mcp-config.json \
  --server patternfly-docs \
  --cli \
  --method tools/call \
  --tool-name usePatternFlyDocs \
  --tool-arg urlList='["documentation/guidelines/README.md"]'
```
