# Architecture Guidelines

Guidelines for system architecture and design patterns in the PatternFly MCP Server codebase.

## Core Architecture

### Options Context System

The codebase uses `AsyncLocalStorage` for per-instance options isolation:

- **Purpose**: Allow multiple server instances with different options
- **Implementation**: `src/options.context.ts`
- **Pattern**: Context is set once, accessed via `getOptions()` within async contexts
- **Isolation**: Each server instance gets its own isolated options context

**Key Functions**:
- `setOptions(options)`: Set options in current context (merges with defaults)
- `getOptions()`: Get options from current context (falls back to defaults)
- `runWithOptions(options, callback)`: Run function with specific options context

### Server Transport System

The server supports two transport modes:

- **stdio** (default): Standard input/output for MCP clients
- **http**: HTTP transport using StreamableHTTPServerTransport

**Transport Selection**:
- Based on `options.http` flag
- Implemented in `src/server.ts`
- HTTP transport in `src/server.http.ts`

### Tool System

Tools follow a tuple pattern:

```typescript
type McpTool = [string, { description: string; inputSchema: any }, (args: any) => Promise<any>];
```

**Tool Registration**:
- Tools are registered in `src/server.ts`
- Each tool is a creator function: `(options) => McpTool`
- Tools use options context for configuration

## Design Patterns

### Memoization

Two-tier memoization system:

- **Resource-level**: Shared across tools (file reads, URL fetches)
- **Tool-level**: Tool-specific caching

**Implementation**: `src/server.caching.ts`

### Error Handling

- Use MCP error codes (`ErrorCode` from SDK)
- Wrap errors in `McpError` for proper MCP protocol compliance
- Provide helpful error messages with suggestions

### Search System

Fuzzy search for component names:

- **Implementation**: `src/server.search.ts`
- **Features**: Levenshtein distance, typo tolerance, suggestions
- **Usage**: Component schema tool uses fuzzy search

## Module Dependencies

```
index.ts
  └── server.ts
      ├── server.http.ts (conditional)
      ├── tool.*.ts (multiple)
      └── options.context.ts
          ├── options.ts
          └── options.defaults.ts
```

## Key Design Decisions

1. **AsyncLocalStorage**: Enables per-instance isolation without global state
2. **Tuple Pattern for Tools**: Simple, type-safe tool definition
3. **Two-Tier Caching**: Balance between performance and memory
4. **Transport Abstraction**: Easy to add new transports
5. **Options Merging**: CLI options override defaults, programmatic override CLI

## Extension Points

- **New Tools**: Create `src/tool.<name>.ts` following tuple pattern
- **New Transports**: Add transport module, update `src/server.ts`
- **New Options**: Update `src/options.ts`, `src/options.defaults.ts`
- **New Utilities**: Add `src/server.<feature>.ts` modules

