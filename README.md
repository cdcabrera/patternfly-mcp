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

### MCP Server
- `build`: Build the TypeScript project
- `start`: Run the built server
- `start:dev`: Run with tsx in watch mode (development)
- `test`: Run linting, type-check, and unit tests
- `test:integration`: Build and run integration tests
- `test:lint`: Run ESLint
- `test:types`: TypeScript type-check only

### Auditor

**Local execution:**
- `auditor`: Run auditor with default configuration
- `auditor:help`: Show auditor help message
- `auditor:quick`: Run quick audit (3 runs)
- `auditor:full`: Run full audit (10 runs)
- `auditor:custom`: Run auditor (pass custom args after `--`)

**MCP server management:**
- `auditor:mcp:start`: Start MCP server in HTTP mode (background)
- `auditor:mcp:stop`: Stop running MCP server
- `auditor:mcp:status`: Check if MCP server is running

**Convenience wrappers (start MCP + run auditor + stop MCP):**
- `auditor:with-mcp`: Start MCP, run auditor, stop MCP
- `auditor:with-mcp:quick`: Same but with quick audit (3 runs)
- `auditor:with-mcp:full`: Same but with full audit (10 runs)

**Containerized execution:**
- `auditor:build`: Build auditor container image
- `auditor:container`: Run auditor in container (default config)
- `auditor:container:quick`: Run quick audit in container (3 runs)
- `auditor:container:full`: Run full audit in container (10 runs)
- `auditor:container:custom`: Run auditor in container (pass custom args after `--`)

**Examples:**
```bash
# Local execution (MCP must be running separately)
npm run auditor:mcp:start  # Start MCP server first
npm run auditor
npm run auditor:mcp:stop   # Stop when done

# Or use convenience wrapper (auto-starts/stops MCP)
npm run auditor:with-mcp
npm run auditor:with-mcp:quick

# Manual MCP management
npm run auditor:mcp:status  # Check if running
npm run auditor:mcp:start   # Start
npm run auditor:mcp:stop    # Stop

# Containerized execution
npm run auditor:build  # Build once
npm run auditor:container
# Note: On macOS, use host.containers.internal instead of localhost
npm run auditor:container:custom -- --mcp-url http://host.containers.internal:3000 --runs 5
```

### Tools
- `tools:huggingface:build`: Build HuggingFace CLI container
- `tools:huggingface`: Run HuggingFace CLI container

See [DOCS.md](./DOCS.md) for complete documentation.

## License

MIT License - see LICENSE file for details.

## Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [Node.js Documentation](https://nodejs.org/en/docs/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
