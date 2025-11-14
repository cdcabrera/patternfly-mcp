# Code Organization Guidelines

Guidelines for organizing code in the PatternFly MCP Server codebase.

## File Structure

### Source Files (`src/`)

```
src/
├── index.ts                    # Entry point, CLI parsing, server startup
├── server.ts                   # Main server implementation (stdio transport)
├── server.http.ts              # HTTP transport implementation
├── options.ts                  # CLI option parsing and validation
├── options.context.ts          # Options context (AsyncLocalStorage)
├── options.defaults.ts        # Default option values
├── tool.*.ts                   # MCP tool implementations
├── server.*.ts                 # Server utilities (caching, search, resources)
├── docs.*.ts                   # Documentation helpers
└── __tests__/                  # Unit tests
```

### Test Files

```
tests/
├── httpTransport.test.ts       # HTTP transport integration tests
├── stdioTransport.test.ts      # stdio transport integration tests
├── utils/                      # Test utilities
│   ├── httpTransportClient.ts  # HTTP test client
│   └── stdioTransportClient.ts # stdio test client
└── __fixtures__/               # Test fixtures
```

## Naming Conventions

### Files

- **Tools**: `tool.<name>.ts` (e.g., `tool.usePatternFlyDocs.ts`)
- **Server modules**: `server.<feature>.ts` (e.g., `server.caching.ts`)
- **Options**: `options.*.ts` (e.g., `options.context.ts`)
- **Documentation**: `docs.<category>.ts` (e.g., `docs.component.ts`)
- **Tests**: `<module>.test.ts` (e.g., `server.test.ts`)

### Functions

- **Tool creators**: `<name>Tool` (e.g., `usePatternFlyDocsTool`)
- **Server functions**: camelCase (e.g., `runServer`, `startHttpTransport`)
- **Options functions**: camelCase (e.g., `parseCliOptions`, `getOptions`)

### Types

- **Interfaces**: PascalCase (e.g., `ServerInstance`, `GlobalOptions`)
- **Type aliases**: PascalCase (e.g., `McpTool`, `CliOptions`)

## Module Patterns

### Tool Pattern

All tools follow the tuple pattern:

```typescript
type McpTool = [
  string,                                    // Tool name
  { description: string; inputSchema: any }, // Tool schema
  (args: any) => Promise<any>                 // Tool callback
];

const myTool = (options = getOptions()): McpTool => {
  const callback = async (args: any = {}) => {
    // Implementation
    return { content: [{ type: 'text', text: '...' }] };
  };
  
  return ['toolName', { description: '...', inputSchema: {...} }, callback];
};
```

### Options Pattern

Options are managed through a three-file system:

1. **`options.ts`**: CLI parsing and types
2. **`options.defaults.ts`**: Default values
3. **`options.context.ts`**: Context management (AsyncLocalStorage)

### Server Pattern

Server implementation is split:

- **`server.ts`**: Main server logic, tool registration, stdio transport
- **`server.http.ts`**: HTTP transport implementation
- **`server.*.ts`**: Utility modules (caching, search, resources)

## Import Organization

1. Node.js built-ins (e.g., `node:http`, `node:fs`)
2. External dependencies (e.g., `@modelcontextprotocol/sdk`)
3. Internal modules (e.g., `./options.context`)

Example:
```typescript
import { createServer } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getOptions } from './options.context';
```

## Export Patterns

- **Default exports**: Avoid (use named exports)
- **Type exports**: Use `export type` for types
- **Function exports**: Named exports

Example:
```typescript
export { runServer, startHttpTransport };
export type { ServerInstance, McpTool };
```

