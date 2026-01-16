# Architecture Notes

## Creator Pattern
Most core services (tools, resources) follow a creator pattern. Instead of exporting static instances, we export functions that accept configuration and return an initialized service.
- **Example**: `usePatternFlyDocsTool(options)`
- **Benefit**: Facilitates dependency injection, configuration isolation, and enhances testability.

## Options Context (Isolation)
The codebase uses `AsyncLocalStorage` to maintain per-session configuration (options, logging, stats) without polluting the global scope.
- **Purpose**: Allows multiple server instances to coexist in the same process.
- **Implementation**: See `src/options.context.ts`.
- **Usage**: Always access options via `getOptions()` within async contexts.

## Caching Strategy
Two-tier memoization system:
1. **Resource-level**: Shared across tools (e.g., file reads, URL fetches).
2. **Tool-level**: Tool-specific caching for refined results.
- **Implementation**: `src/server.caching.ts` provides a `memo` utility with TTL and LRU support.

## Tools-as-Plugins (Isolated Execution)
External tools are executed within a dedicated **Tools Host** child process (Node 22+).
- **Security**: Strict mode denies network and filesystem write access.
- **Stability**: Prevents faulty plugins from crashing the main MCP server.
- **Dynamic Normalization**: Handled by `createMcpTool` to bridge Zod/JSON Schema to MCP SDK.

## Concurrency Management
The `promiseQueue` implements a "sliding window" pattern to maintain a full pipeline of active requests.
- **Benefit**: Maximizes throughput for network-heavy tasks while strictly adhering to resource limits.
- **Implementation**: `src/server.getResources.ts`.
