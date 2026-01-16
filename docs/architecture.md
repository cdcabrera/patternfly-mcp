# Architecture

This document describes the current architecture, design patterns, and future plans for the PatternFly MCP Server.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Current Architecture](#current-architecture)
- [Design Patterns](#design-patterns)
- [Module Dependencies](#module-dependencies)
- [Extension Points](#extension-points)
- [Key Design Decisions](#key-design-decisions)
- [Future Architecture Plans](#future-architecture-plans)

## Architecture Overview

The PatternFly MCP Server is built with Node.js and TypeScript, following a modular architecture that supports both stdio and HTTP transport modes. The server is designed to be extensible through tool plugins while maintaining security through process isolation.

## Current Architecture

### Options Context System

The codebase uses `AsyncLocalStorage` for per-instance options isolation, allowing multiple server instances to run with different options without conflicts.

**Implementation**: `src/options.context.ts`

**Key Functions**:
- `setOptions(options)`: Set options in current context (merges with defaults)
- `getOptions()`: Get options from current context (falls back to defaults)
- `runWithOptions(options, callback)`: Run function with specific options context
- `runWithSession(session, callback)`: Run function with session context

**Benefits**:
- Per-instance isolation without global state
- Thread-safe option access
- Automatic context propagation through async operations

**Pattern**: Context is set once per server instance, accessed via `getOptions()` within async contexts.

### Server Transport System

The server supports two transport modes for MCP communication:

- **stdio** (default): Standard input/output for MCP clients
- **http**: HTTP transport using StreamableHTTPServerTransport

**Transport Selection**: Based on `options.isHttp` flag in `src/server.ts`

**Implementation**:
- stdio: `StdioServerTransport` from MCP SDK
- HTTP: `src/server.http.ts` with StreamableHTTPServerTransport

**Security Features** (HTTP mode):
- DNS rebinding protection enabled by default
- CORS support via `--allowed-origins`
- Host validation via `--allowed-hosts`
- Session-based isolation (UUID session IDs)

### Tool System

Tools follow a tuple pattern for registration:

```typescript
type McpTool = [
  name: string,
  schema: { description: string; inputSchema: any },
  handler: (args?: unknown) => any | Promise<any>
];
```

**Tool Registration**:
- Tools are registered in `src/server.ts`
- Each tool is a creator function: `(options) => McpTool`
- Tools use options context for configuration
- Built-in tools: `searchPatternFlyDocs`, `usePatternFlyDocs`, `componentSchemas`

**Tool Plugins**:
- External tools run out-of-process in isolated Tools Host (Node.js >= 22)
- Security: Strict isolation by default (network/filesystem restrictions)
- Supports ESM packages and local ESM files
- Implementation: `src/server.tools.ts`, `src/server.toolsHost.ts`

**Tool Authoring**:
- Use `createMcpTool` helper for normalization
- Supports JSON Schema or Zod schemas
- Can define single tool or multiple tools per module

### Resource System

The server exposes a resource-centric architecture via the `patternfly://` URI scheme:

- **`patternfly://context`**: General PatternFly development context
- **`patternfly://docs/index`**: Index of all available documentation pages
- **`patternfly://docs/{name}`**: Documentation for a specific component
- **`patternfly://schemas/index`**: Index of all available component schemas
- **`patternfly://schemas/{name}`**: JSON Schema for a specific component

**Implementation**: `src/resource.*.ts` files

**Resource Registration**:
- Resources are registered in `src/server.ts`
- Each resource is a creator function: `(options) => McpResource`
- Resources use options context for configuration

### Memoization System

Two-tier memoization system for performance optimization:

- **Resource-level**: Shared across tools (file reads, URL fetches)
- **Tool-level**: Tool-specific caching

**Implementation**: `src/server.caching.ts`

**Features**:
- Configurable cache limits
- Expiration support (sliding window)
- Automatic cache rolloff with cleanup callbacks
- Error caching (optional)

**Memoization Usage**:
- Server instances: `runServer.memo()` prevents port conflicts
- Tool results: Cached per tool with configurable limits
- Resource fetches: Cached with expiration

### Logging System

The server uses a `diagnostics_channel`–based logger that keeps STDIO stdout pure by default.

**Implementation**: `src/logger.ts`, `src/server.logger.ts`

**Features**:
- No terminal output unless sink enabled (`--log-stderr`)
- Protocol logging support (`--log-protocol`)
- Configurable log levels (`debug`, `info`, `warn`, `error`)
- Session-based channel isolation

**Logging Options**:
- `--log-stderr`: Enable terminal logging
- `--log-protocol`: Forward logs to MCP clients
- `--log-level <level>`: Set log level
- `--verbose`: Shortcut for `debug` level

### Statistics and Monitoring

The server provides statistics and monitoring capabilities:

**Implementation**: `src/server.stats.ts`, `src/stats.ts`

**Features**:
- Health tracking
- Traffic monitoring
- Transport statistics
- Diagnostics channel integration

## Design Patterns

### Memoization Pattern

**Two-Tier Caching**:
- Resource-level: Shared across tools (file reads, URL fetches)
- Tool-level: Tool-specific caching

**Cache Management**:
- Configurable cache limits
- Expiration support (sliding window)
- Automatic cleanup on cache rolloff

**Benefits**:
- Performance optimization
- Reduced network/file I/O
- Memory-efficient with limits

### Error Handling Pattern

**MCP Error Codes**:
- Use `McpError` with proper error codes (`InvalidParams`, `InternalError`)
- Graceful degradation (e.g., schema fetching failures don't break docs)
- Clear error messages with suggestions

**Implementation**:
- All tools use `McpError` from MCP SDK
- Proper error propagation through async contexts
- Error messages include helpful suggestions

### Search System

**Fuzzy Search**:
- Implementation: `src/server.search.ts`
- Features: Levenshtein distance, typo tolerance, suggestions
- Usage: Component schema tool uses fuzzy search

**Component Search**:
- Searches component names with fuzzy matching
- Returns exact matches and suggestions
- Supports wildcard (`*`) for all components

## Module Dependencies

```
index.ts (CLI entry point)
  └── server.ts
      ├── server.http.ts (conditional, HTTP transport)
      ├── tool.*.ts (multiple tool implementations)
      ├── resource.*.ts (multiple resource implementations)
      ├── server.tools.ts (tool composition, Tools Host)
      ├── server.resources.ts (resource composition)
      ├── server.caching.ts (memoization)
      ├── server.logger.ts (logging)
      ├── server.stats.ts (statistics)
      └── options.context.ts
          ├── options.ts (CLI parsing)
          └── options.defaults.ts (default values)
```

## Extension Points

### Adding New Tools

1. Create `src/tool.<name>.ts` following the tuple pattern
2. Implement tool creator function: `(options) => McpTool`
3. Register in `builtinTools` array in `src/server.ts`
4. Use `createMcpTool` helper for normalization

### Adding New Resources

1. Create `src/resource.<name>.ts`
2. Implement resource creator function: `(options) => McpResource`
3. Register in `builtinResources` array in `src/server.ts`

### Adding New Transports

1. Add transport module (e.g., `src/server.ws.ts` for WebSocket)
2. Update `src/server.ts` to support new transport
3. Add CLI options in `src/options.ts`
4. Update default options in `src/options.defaults.ts`

### Adding New Options

1. Update `src/options.ts` for CLI parsing
2. Update `src/options.defaults.ts` for default values
3. Update TypeScript types in `src/options.ts`

## Key Design Decisions

### 1. AsyncLocalStorage for Options Context

**Decision**: Use `AsyncLocalStorage` for per-instance isolation

**Rationale**:
- Enables multiple server instances with different options
- No global state pollution
- Thread-safe option access
- Automatic context propagation

**Alternatives Considered**:
- Global options object (rejected: conflicts with multiple instances)
- Dependency injection (rejected: too complex for this use case)

### 2. Tuple Pattern for Tools

**Decision**: Tools use tuple format `[name, schema, handler]`

**Rationale**:
- Simple and type-safe
- Matches MCP SDK expectations
- Easy to create and register
- Clear separation of concerns

**Alternatives Considered**:
- Object format (rejected: less type-safe, more verbose)
- Class-based (rejected: over-engineering)

### 3. Two-Tier Caching

**Decision**: Separate resource-level and tool-level caching

**Rationale**:
- Balance between performance and memory
- Resource caching shared across tools (efficient)
- Tool caching isolated per tool (flexible)
- Configurable limits prevent memory issues

### 4. Out-of-Process Tool Plugins

**Decision**: Tool plugins run in isolated Tools Host process

**Rationale**:
- Security: Isolated execution prevents malicious code
- Stability: Plugin crashes don't affect main server
- Permissions: Fine-grained control via isolation presets

**Trade-offs**:
- Requires Node.js >= 22
- IPC overhead (minimal for tool calls)
- More complex implementation

### 5. Diagnostics Channel Logging

**Decision**: Use `diagnostics_channel` for logging instead of console

**Rationale**:
- Keeps STDIO stdout pure (required for MCP)
- Flexible logging sinks (stderr, protocol, custom)
- Session-based isolation
- No performance impact when disabled

## Future Architecture Plans

### Planned Improvements

1. **External Documentation Migration**
   - Migrate `documentation/` directory to external storage
   - Version-aware documentation loading
   - API-based documentation access (when available)

2. **Enhanced Tool Plugin System**
   - Plugin registry/discovery
   - Plugin versioning
   - Plugin dependencies

3. **Performance Optimizations**
   - Lazy loading of documentation
   - Incremental documentation updates
   - Better caching strategies

4. **Monitoring and Observability**
   - Enhanced statistics
   - Performance metrics
   - Health check endpoints (HTTP mode)

### Migration Paths

#### Documentation Externalization

**Current State**: Documentation stored in `documentation/` directory

**Future State**: External storage (API, CDN, or versioned repository)

**Migration Strategy**:
1. Maintain backward compatibility during transition
2. Support both local and external documentation sources
3. Version-aware documentation loading
4. Gradual migration with feature flags

#### Breaking Changes

**Versioning Strategy**: Semantic versioning (major.minor.patch)

**Deprecation Policy**:
- Deprecated features marked in documentation
- Minimum 2 minor versions before removal
- Clear migration guides

**Known Future Breaking Changes**:
- Removal of `--docs-host` flag (already disabled)
- Removal of deprecated `componentSchemas` tool (integrated into `usePatternFlyDocs`)

### Architecture Evolution Timeline

**Current (v0.5.0)**:
- Options Context System (AsyncLocalStorage)
- Dual transport (stdio, HTTP)
- Tool plugin system (out-of-process)
- Resource-centric architecture
- Two-tier memoization
- Diagnostics channel logging

**Near-term (v0.6.0 - v0.7.0)**:
- Enhanced tool plugin system
- Performance optimizations
- External documentation support (preparation)

**Medium-term (v0.8.0 - v1.0.0)**:
- External documentation migration
- Enhanced monitoring
- Plugin registry

**Long-term (v1.0.0+)**:
- API-based documentation access
- Advanced caching strategies
- Multi-version documentation support

## External Documentation Strategy

### Current State

The `documentation/` directory contains PatternFly development rules and guidelines. This directory is considered **temporary** and will be externalized in the future.

### Migration Plan

1. **Phase 1**: Identify external storage solution
   - API endpoint
   - Versioned repository
   - CDN distribution

2. **Phase 2**: Implement external loading
   - Support both local and external sources
   - Version-aware loading
   - Fallback to local if external unavailable

3. **Phase 3**: Migrate content
   - Move documentation to external storage
   - Update references
   - Remove local `documentation/` directory

4. **Phase 4**: Versioning
   - Support multiple PatternFly versions
   - Version-specific documentation loading
   - Backward compatibility

### Benefits of Externalization

- **Reduced package size**: Documentation not bundled with package
- **Always up-to-date**: External source can be updated independently
- **Version flexibility**: Support multiple PatternFly versions
- **Maintenance**: Easier to maintain and update documentation

### Considerations

- **Offline support**: Need fallback mechanism
- **Versioning**: How to handle multiple PatternFly versions
- **Performance**: Caching strategy for external content
- **Reliability**: Handling external source failures
