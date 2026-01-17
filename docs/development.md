# Development guide

Complete guide to using the PatternFly MCP Server for development including CLI and programmatic API usage.

**Development:**
- [CLI Usage](#cli-usage)
- [Programmatic Usage](#programmatic-usage)
- [Tool Plugins](#tool-plugins)
- [Initial Troubleshooting](#initial-troubleshooting)

## CLI Usage

### Available options

| Flag                                  | Description                                      | Default              |
|:--------------------------------------|:-------------------------------------------------|:---------------------|
| `--http`                              | Enable HTTP transport mode                       | `false` (stdio mode) |
| `--port <num>`                        | Port for HTTP transport                          | `8080`               |
| `--host <string>`                     | Host to bind to                                  | `127.0.0.1`          |
| `--allowed-origins <origins>`         | Comma-separated list of allowed CORS origins     | `none`               |
| `--allowed-hosts <hosts>`             | Comma-separated list of allowed host headers     | `none`               |
| `--tool <path>`                       | Path to external Tool Plugin (repeatable)        | `none`               |
| `--plugin-isolation <none \| strict>` | Isolation preset for external tools-as-plugins   | `strict`             |
| `--log-stderr`                        | Enable terminal logging                          | `false`              |
| `--log-protocol`                      | Forward logs to MCP clients                      | `false`              |
| `--log-level <level>`                 | Set log level (`debug`, `info`, `warn`, `error`) | `info`               |
| `--verbose`                           | Shortcut for `--log-level debug`                 | `false`              |

### Basic use scenarios

**stdio mode (default):**
```bash
npx @patternfly/patternfly-mcp
```

**HTTP mode:**
```bash
npx @patternfly/patternfly-mcp --http --port 8080
```

**HTTP mode with custom security**:
```bash
npx @patternfly/patternfly-mcp --http --port 3000 --allowed-origins "https://app.com"
```

**Loading external tool plugins**:
```bash
npx @patternfly/patternfly-mcp --tool ./first-tool.js --tool ./second-tool.ts
```

### Testing with MCP Inspector

The `@modelcontextprotocol/inspector` is the recommended way to visualize the server's interface.

1. **Start the Inspector**:
   ```bash
   npx -y @modelcontextprotocol/inspector npx @patternfly/patternfly-mcp
   ```
2. **Interact**: The inspector opens a web interface (typically at `http://localhost:5173`) where you can list tools, execute them, and view resource contents.

**Example with repository context:**
```bash
npx @modelcontextprotocol/inspector-cli \
  --config ./mcp-config.json \
  --server patternfly-docs \
  --cli \
  --method tools/call \
  --tool-name usePatternFlyDocs \
  --tool-arg urlList='["documentation/guidelines/README.md"]'
```

## Programmatic usage

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

