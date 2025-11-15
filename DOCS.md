# PatternFly MCP Server Documentation

Complete usage guide for the PatternFly MCP Server.

## Table of Contents

1. [Installation](#installation)
2. [Transport Modes](#transport-modes)
3. [CLI Options](#cli-options)
4. [Tools](#tools)
5. [MCP Client Configuration](#mcp-client-configuration)
6. [Programmatic API](#programmatic-api)
7. [Environment Variables](#environment-variables)
8. [Troubleshooting](#troubleshooting)

## Installation

### Prerequisites

- Node.js 20.0.0 or higher
- npm (or another Node package manager)

### Local Development

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Run in watch/dev mode (TypeScript via tsx):
```bash
npm run start:dev
```

### Use via npx (after publishing)

```bash
npx @patternfly/patternfly-mcp
```

Or install locally in a project and run:

```bash
npm install @patternfly/patternfly-mcp
npx @patternfly/patternfly-mcp
```

## Transport Modes

The server supports two transport modes for MCP communication.

### stdio Mode (Default)

The default transport mode uses standard input/output for communication with MCP clients. This is the standard MCP transport and works with most MCP clients.

**Usage**:
```bash
npx @patternfly/patternfly-mcp
# or explicitly
npx @patternfly/patternfly-mcp --stdio  # (default, flag optional)
```

**When to use**: Standard MCP client integration, local development, most use cases.

### HTTP Mode

HTTP transport mode enables the server to accept HTTP requests, useful for web-based clients or when stdio is not available.

**Basic Usage**:
```bash
npx @patternfly/patternfly-mcp --http
```

**With Custom Port and Host**:
```bash
npx @patternfly/patternfly-mcp --http --port 8080 --host 0.0.0.0
```

**With Security Options**:
```bash
npx @patternfly/patternfly-mcp --http \
  --port 3000 \
  --allowed-origins "https://app.com,https://admin.app.com" \
  --allowed-hosts "localhost,127.0.0.1"
```

**Security Features**:
- DNS rebinding protection enabled by default
- CORS support via `--allowed-origins`
- Host validation via `--allowed-hosts`
- Session-based isolation (UUID session IDs)

**When to use**: Web-based MCP clients, HTTP-based integrations, development servers.

## CLI Options

| Flag | Description | Default | Example |
|------|-------------|---------|---------|
| `--http` | Enable HTTP transport mode | stdio | `--http` |
| `--port` | HTTP server port (1-65535) | 3000 | `--port 8080` |
| `--host` | HTTP server host | localhost | `--host 0.0.0.0` |
| `--allowed-origins` | CORS allowed origins (comma-separated) | none | `--allowed-origins "https://app.com"` |
| `--allowed-hosts` | Allowed hosts for DNS rebinding protection | none | `--allowed-hosts "localhost,127.0.0.1"` |
| `--docs-host` | Enable docs-host mode (local llms.txt) | false | `--docs-host` |
| `--kill-existing` | Kill existing PatternFly MCP server on same port | false | `--kill-existing` |

**Examples**:

```bash
# stdio mode with docs-host
npx @patternfly/patternfly-mcp --docs-host

# HTTP mode on custom port
npx @patternfly/patternfly-mcp --http --port 8080

# HTTP mode with security
npx @patternfly/patternfly-mcp --http \
  --port 3000 \
  --allowed-origins "https://app.com,https://admin.app.com" \
  --allowed-hosts "localhost,127.0.0.1"

# HTTP mode with auto-kill existing instance
npx @patternfly/patternfly-mcp --http --kill-existing
```

## Tools

The server provides three MCP tools for accessing PatternFly documentation and component schemas.

### Tool: usePatternFlyDocs

Fetch PatternFly documentation from one or more URLs. Can be used for index/overview files (README.md, llms.txt) or specific documentation pages (design guidelines, accessibility, etc.).

**Parameters**:
- `urlList`: string[] (required) - Array of URLs or local file paths to PatternFly documentation

**Response**:
- `content[0].type`: "text"
- `content[0].text`: Concatenated documentation content

**Example - Index file**:
```json
{
  "method": "tools/call",
  "params": {
    "name": "usePatternFlyDocs",
    "arguments": {
      "urlList": ["documentation/guidelines/README.md"]
    }
  }
}
```

**Example - Specific documentation page**:
```json
{
  "method": "tools/call",
  "params": {
    "name": "usePatternFlyDocs",
    "arguments": {
      "urlList": [
        "https://example.com/patternfly/docs/component/button.md"
      ]
    }
  }
}
```

**Note**: Use searchPatternFlyDocs to discover actual documentation URLs. The URLs can be local file paths or remote HTTP/HTTPS URLs.

### Tool: searchPatternFlyDocs

Search for PatternFly component documentation URLs by component name. Uses fuzzy search against PatternFly component names and returns matching documentation URLs (does not fetch content).

**Parameters**:
- `searchQuery`: string (required) - Component name to search for (e.g., "button", "table", "accordion")

**Response**:
- `content[0].type`: "text"
- `content[0].text`: List of matching documentation URLs

**Example**:
```json
{
  "method": "tools/call",
  "params": {
    "name": "searchPatternFlyDocs",
    "arguments": {
      "searchQuery": "button"
    }
  }
}
```

**Note**: After getting URLs from searchPatternFlyDocs, use usePatternFlyDocs to fetch the actual documentation content.

### Tool: componentSchemas

Get JSON Schema for PatternFly React components. Returns prop definitions, types, and validation rules.

**Parameters**:
- `componentName`: string (required) - Name of the PatternFly component (e.g., "Button", "Table")

**Response**:
- `content[0].type`: "text"
- `content[0].text`: JSON Schema as string

**Example**:
```json
{
  "method": "tools/call",
  "params": {
    "name": "componentSchemas",
    "arguments": {
      "componentName": "Button"
    }
  }
}
```

**Note**: The tool uses fuzzy search, so typos and case variations are handled automatically with suggestions.

## MCP Client Configuration

Most MCP clients use a JSON configuration to specify how to start this server. The server itself only reads CLI flags and environment variables, not the JSON configuration.

### Minimal Client Config (npx)

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

### stdio Mode with Docs-Host

```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "npx",
      "args": ["-y", "@patternfly/patternfly-mcp@latest", "--docs-host"],
      "description": "PatternFly docs (docs-host mode)"
    }
  }
}
```

### HTTP Mode

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
        "--host",
        "localhost"
      ],
      "description": "PatternFly docs (HTTP mode)"
    }
  }
}
```

### HTTP Mode with Security

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
        "https://app.com,https://admin.app.com",
        "--allowed-hosts",
        "localhost,127.0.0.1"
      ],
      "description": "PatternFly docs (HTTP mode with security)"
    }
  }
}
```

### Local Development (After Build)

```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/patternfly-mcp",
      "description": "PatternFly docs (local build)"
    }
  }
}
```

## Inspector-CLI Examples

The [MCP Inspector CLI](https://github.com/modelcontextprotocol/inspector) can be used to test the server.

**Note**: The parameter name is `urlList` and it must be a JSON array of strings.

### usePatternFlyDocs Example

```bash
npx @modelcontextprotocol/inspector-cli \
  --config ./mcp-config.json \
  --server patternfly-docs \
  --cli \
  --method tools/call \
  --tool-name usePatternFlyDocs \
  --tool-arg urlList='["documentation/guidelines/README.md"]'
```

### searchPatternFlyDocs Example

```bash
npx @modelcontextprotocol/inspector-cli \
  --config ./mcp-config.json \
  --server patternfly-docs \
  --cli \
  --method tools/call \
  --tool-name searchPatternFlyDocs \
  --tool-arg searchQuery="button"
```

### usePatternFlyDocs Example (with URLs from searchPatternFlyDocs)

```bash
npx @modelcontextprotocol/inspector-cli \
  --config ./mcp-config.json \
  --server patternfly-docs \
  --cli \
  --method tools/call \
  --tool-name usePatternFlyDocs \
  --tool-arg urlList='["https://example.com/patternfly/docs/component/button.md"]'
```

### componentSchemas Example

```bash
npx @modelcontextprotocol/inspector-cli \
  --config ./mcp-config.json \
  --server patternfly-docs \
  --cli \
  --method tools/call \
  --tool-name componentSchemas \
  --tool-arg componentName='Button'
```

## Programmatic API

The package provides programmatic access through the `start()` function for advanced use cases.

### Basic Usage

```typescript
import { start, type CliOptions, type ServerInstance } from '@patternfly/patternfly-mcp';

// Use with default options (equivalent to CLI without flags)
const server = await start();
```

### With Options

```typescript
// Override CLI options programmatically
const serverWithOptions = await start({ docsHost: true });

// Multiple options
const customServer = await start({ 
  docsHost: true,
  http: true,
  port: 8080,
  host: '0.0.0.0'
});

// TypeScript type safety
const options: Partial<CliOptions> = { docsHost: true };
const typedServer = await start(options);
```

### ServerInstance Interface

The `start()` function returns a `ServerInstance` object:

```typescript
interface ServerInstance {
  /**
   * Stop the server gracefully
   */
  stop(): Promise<void>;

  /**
   * Check if server is running
   */
  isRunning(): boolean;
}
```

### Usage Examples

```typescript
const server = await start();

// Check if server is running
if (server.isRunning()) {
  console.log('Server is active');
}

// Graceful shutdown
await server.stop();

// Verify shutdown
console.log('Server running:', server.isRunning()); // false
```

### Advanced: Custom Tools

```typescript
import { runServer } from '@patternfly/patternfly-mcp';

const customServer = await runServer(
  { /* options */ },
  {
    tools: [
      // Add custom tools here
    ],
    enableSigint: true,
    allowProcessExit: false // For testing
  }
);
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DOC_MCP_FETCH_TIMEOUT_MS` | Milliseconds to wait before aborting an HTTP fetch | 15000 |
| `DOC_MCP_CLEAR_COOLDOWN_MS` | Default cooldown value used in internal cache configuration | N/A |

**Note**: The current public API does not expose a `clearCache` tool.

## Docs-Host Mode

If you run the server with `--docs-host`, local paths you pass in `urlList` are resolved relative to the `llms-files` folder at the repository root. This is useful when you have pre-curated llms.txt files locally.

**Example**:
```bash
npx @patternfly/patternfly-mcp --docs-host
```

Then, passing a local path such as `react-core/6.0.0/llms.txt` in `urlList` will load from `llms-files/react-core/6.0.0/llms.txt`.

## Returned Content Format

For each provided path or URL, the server returns a section:

- **Header**: `# Documentation from <resolved-path-or-url>`
- **Body**: The raw file content fetched from disk or network
- **Separator**: Sections are concatenated with `\n\n---\n\n`

This makes it easier to see where each chunk of content came from when multiple inputs are provided.

If an entry fails to load, an inline error message is included for that entry.

## Troubleshooting

### Server Won't Start

- **Check Node.js version**: Requires Node.js 20.0.0 or higher
- **Check port availability**: If using HTTP mode, ensure the port is not in use
- **Check build**: Run `npm run build` to ensure the project is built

### HTTP Transport Issues

- **Port already in use**: 
  - If it's another PatternFly MCP server instance, use `--kill-existing` flag
  - Or change the port with `--port` flag
  - The server will show helpful error messages with PID and command
- **CORS errors**: Add your origin to `--allowed-origins`
- **Connection refused**: Check `--host` setting and firewall rules

### Tool Execution Errors

- **Invalid parameter**: Ensure `urlList` is an array of strings
- **File not found**: Check file paths are relative to the project root
- **Network errors**: Check internet connection for external URLs

### Common Issues

- **TypeScript errors**: Run `npm run test:types` to check types
- **Linting errors**: Run `npm run test:lint-fix` to auto-fix
- **Test failures**: Run `npm test` to see detailed error messages

## Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [Node.js Documentation](https://nodejs.org/en/docs/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

