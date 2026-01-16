# Usage Guide

## Built-in Tools

### `searchPatternFlyDocs`
Search for components or documentation pages.
- **Query**: Use `*` to list everything or a specific string (e.g., "Table").
- **Returns**: A list of component names and URLs.

### `usePatternFlyDocs`
The primary tool for retrieving context. It performs "Technical Spec Fusion" by combining Markdown documentation with JSON schemas.
- **Args**: `name` (e.g., "Button") or `urlList` (from search results).

## Built-in Resources
Access data directly via the `patternfly://` protocol:
- `patternfly://docs/{name}`: Component documentation.
- `patternfly://schemas/{name}`: Component JSON Schema.
- `patternfly://context`: General design system rules.

## Authoring Custom Tools
Extend the server using the `createMcpTool` helper. 
*See [docs/examples/tool-plugins.ts](./examples/tool-plugins.ts) for a full example.*

## CLI Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--http` | Enable HTTP transport mode | `false` (stdio) |
| `--port <num>` | Port for HTTP transport | `8080` |
| `--host <string>` | Host to bind to | `127.0.0.1` |
| `--allowed-origins <origins>` | Comma-separated list of allowed CORS origins | `none` |
| `--allowed-hosts <hosts>` | Comma-separated list of allowed host headers | `none` |
| `--tool <path>` | Path to external Tool Plugin (repeatable) | `none` |
| `--plugin-isolation <none|strict>` | Isolation preset for external tools-as-plugins | `strict` |
| `--log-stderr` | Enable terminal logging | `false` |
| `--log-protocol` | Forward logs to MCP clients | `false` |
| `--log-level <level>` | Set log level (`debug`, `info`, `warn`, `error`) | `info` |
| `--verbose` | Shortcut for `--log-level debug` | `false` |

### Common Usage Scenarios

**Standard MCP Client (Claude Desktop/Cursor)**:
```bash
npx -y @patternfly/patternfly-mcp
```

**HTTP Mode with Custom Security**:
```bash
npx @patternfly/patternfly-mcp --http --port 3000 --allowed-origins "https://app.com"
```

**Loading External Tool Plugins**:
```bash
npx @patternfly/patternfly-mcp --tool ./my-plugin.js --tool ./other-plugin.ts
```

## Testing with MCP Inspector

The `@modelcontextprotocol/inspector` is the recommended way to visualize and debug the server's interface.

1. **Start the Inspector**:
   ```bash
   npx -y @modelcontextprotocol/inspector npx @patternfly/patternfly-mcp
   ```
2. **Interact**: The inspector opens a web interface (typically at `http://localhost:5173`) where you can list tools, execute them, and view resource contents.

## Programmatic Use

You can embed the MCP server in your own applications:

```typescript
import { start, createMcpTool } from '@patternfly/patternfly-mcp';

const myTool = createMcpTool({
  name: 'my-tool',
  description: 'My tool description',
  inputSchema: {},
  handler: async (args) => args
});

const server = await start({
  toolModules: [myTool]
});
```
