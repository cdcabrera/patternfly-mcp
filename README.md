# PatternFly MCP Server

A Model Context Protocol (MCP) server that provides access to PatternFly React development rules and documentation, built with Node.js and TypeScript.

## What is MCP?

The Model Context Protocol (MCP) is an open standard that enables AI assistants to securely access external data sources and tools. This server provides a standardized way to expose PatternFly documentation and development rules to MCP-compatible clients.

## Quick Start

### Prerequisites

- Node.js 20.0.0 or higher
  - **Note**: Loading **Tool Plugins** from an external file or package requires Node.js >= 22 at runtime. On Node < 22, the server starts with built‑in tools only and logs a one‑time warning.
- NPM (or another Node package manager)

### Installation

**Local development:**
```bash
npm install
npm run build
npm run start:dev  # Run in watch/dev mode
```

**Use via npx (after publishing):**
```bash
npx @patternfly/patternfly-mcp
```

**Or install locally:**
```bash
npm install @patternfly/patternfly-mcp
npx @patternfly/patternfly-mcp
```

### Basic Usage

**stdio mode (default):**
```bash
npx @patternfly/patternfly-mcp
```

**HTTP mode:**
```bash
npx @patternfly/patternfly-mcp --http --port 8080
```

## CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--http` | Enable HTTP transport mode | stdio |
| `--port <number>` | HTTP server port | 8080 |
| `--host <string>` | HTTP server host | 127.0.0.1 |
| `--allowed-origins <origins>` | CORS allowed origins (comma-separated) | none |
| `--allowed-hosts <hosts>` | Allowed hosts for DNS rebinding protection | none |
| `--log-stderr` | Enable terminal logging | false |
| `--log-protocol` | Forward logs to MCP clients | false |
| `--log-level <level>` | Set log level (`debug`, `info`, `warn`, `error`) | info |
| `--verbose` | Shortcut for `debug` level | - |
| `--tool <path\|package>` | Load tool plugin(s) | - |
| `--plugin-isolation <none\|strict>` | Tools Host permission preset | strict |
| `--docs-host` | Disabled - produces no results | - |

See [docs/usage.md](docs/usage.md) for detailed CLI documentation and examples.

## MCP Client Configuration

**Minimal client config (stdio):**
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

**HTTP transport mode:**
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

See [docs/usage.md](docs/usage.md) for more configuration examples.

## Features

- **TypeScript**: Full type safety and modern JavaScript features
- **PatternFly Documentation Access**: Browse, search, and retrieve PatternFly development rules
- **Component Schemas**: Access JSON Schema validation for PatternFly React components
- **Dual Transport**: stdio (default) and HTTP transport modes
- **Tool Plugins**: Extend server capabilities with custom tools
- **Smart Search**: Find specific rules and patterns across all documentation
- **Error Handling**: Robust error handling with proper MCP error codes

## Documentation

- **[docs/README.md](docs/README.md)** - Documentation index and navigation
- **[docs/usage.md](docs/usage.md)** - Comprehensive usage guide (CLI, programmatic, tools, resources, configuration)
- **[docs/architecture.md](docs/architecture.md)** - Current and future architecture
- **[docs/examples/](docs/examples/)** - Code examples

## Resources

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [PatternFly React](https://www.patternfly.org/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Node.js Documentation](https://nodejs.org/en/docs/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)

## For AI Agents

AI agents working with this codebase should refer to the `guidelines/` directory (coming soon) for codebase maintenance patterns, architecture guidelines, and development conventions.
