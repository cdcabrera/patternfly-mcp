# PatternFly MCP Server

A Model Context Protocol (MCP) server that provides access to PatternFly React development rules and documentation, built with Node.js and TypeScript.

## What is MCP?

The Model Context Protocol (MCP) is an open standard that enables AI assistants to securely access external data sources and tools. This server provides a standardized way to expose PatternFly documentation and development rules to MCP-compatible clients.

## Quick Start

### Installation

```bash
npm install
npm run build
```

### Run

**stdio mode (default)**:
```bash
npx @patternfly/patternfly-mcp
```

**HTTP mode**:
```bash
npx @patternfly/patternfly-mcp --http --port 3000
```

## Features

- **TypeScript**: Full type safety and modern JavaScript features
- **PatternFly Documentation Access**: Browse, search, and retrieve PatternFly development rules
- **Component Schemas**: Access JSON Schema validation for PatternFly React components
- **Dual Transport**: stdio (default) and HTTP transport modes
- **Smart Search**: Find specific rules and patterns across all documentation
- **Error Handling**: Robust error handling with proper MCP error codes

## Prerequisites

- Node.js 20.0.0 or higher
- npm (or another Node package manager)

## CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--http` | Enable HTTP transport mode | stdio |
| `--port` | HTTP server port (1-65535) | 3000 |
| `--host` | HTTP server host | localhost |
| `--allowed-origins` | CORS allowed origins (comma-separated) | none |
| `--allowed-hosts` | Allowed hosts for DNS rebinding protection | none |
| `--docs-host` | Enable docs-host mode (local llms.txt) | false |

**Examples**:

```bash
# stdio mode with docs-host
npx @patternfly/patternfly-mcp --docs-host

# HTTP mode on custom port
npx @patternfly/patternfly-mcp --http --port 8080

# HTTP mode with security
npx @patternfly/patternfly-mcp --http \
  --port 3000 \
  --allowed-origins "https://app.com" \
  --allowed-hosts "localhost,127.0.0.1"
```

## Tools

The server provides three MCP tools:

- **usePatternFlyDocs**: Fetch high-level index content (READMEs, llms.txt files)
- **fetchDocs**: Fetch specific documentation pages (design guidelines, accessibility)
- **componentSchemas**: Get JSON Schema for PatternFly React components

See [DOCS.md](./DOCS.md) for detailed tool documentation and examples.

## Documentation

- **[DOCS.md](./DOCS.md)** - Complete usage guide, tools, examples, and API documentation
- **[CONTRIBUTING.md](./CONTRIBUTING.md)** - Developer contribution guide
- **[guidelines/](./guidelines/)** - AI agent codebase maintenance guide

## Scripts

- `build`: Build the TypeScript project
- `start`: Run the built server
- `start:dev`: Run with tsx in watch mode (development)
- `test`: Run linting, type-check, and unit tests
- `test:integration`: Build and run integration tests
- `test:lint`: Run ESLint
- `test:types`: TypeScript type-check only

See [DOCS.md](./DOCS.md) for complete documentation.

## License

MIT License - see LICENSE file for details.

## Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [Node.js Documentation](https://nodejs.org/en/docs/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
