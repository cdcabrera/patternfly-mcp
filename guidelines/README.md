# Codebase Maintenance Guidelines

This directory contains agent-specific guidance for maintaining and updating the PatternFly MCP Server codebase.

## Guidelines Index

- **[Code Organization](./code-organization.md)** - File structure, module patterns, naming conventions
- **[Testing Strategy](./testing-strategy.md)** - Test organization and patterns
- **[Git Workflow](./git-workflow.md)** - Branch naming, commits, PRs
- **[Type Safety](./type-safety.md)** - TypeScript patterns and conventions
- **[Architecture](./architecture.md)** - System design and patterns

## Quick Reference

### File Structure
```
src/
├── index.ts              # Entry point
├── server.ts             # Server implementation (stdio)
├── server.http.ts        # HTTP transport implementation
├── options.ts            # CLI option parsing
├── options.context.ts    # Options context (AsyncLocalStorage)
├── options.defaults.ts   # Default option values
├── tool.*.ts             # MCP tool implementations
├── server.*.ts           # Server utilities (caching, search, etc.)
└── __tests__/            # Unit tests
```

### Key Patterns

- **Options Context**: Uses `AsyncLocalStorage` for per-instance isolation
- **Tool Pattern**: Tools follow tuple pattern: `[name, schema, callback]`
- **Testing**: Unit tests in `src/__tests__/`, integration tests in `tests/`
- **Snapshots**: Used for stable outputs (tool schemas, server responses)

### Common Tasks

- **Adding a new tool**: Create `src/tool.<name>.ts` following the tuple pattern
- **Adding CLI options**: Update `src/options.ts` and `src/options.defaults.ts`
- **Adding tests**: Follow existing test patterns in `src/__tests__/`
- **Updating documentation**: See [CONTRIBUTING.md](../CONTRIBUTING.md) for developer guidance

## When to Use These Guidelines

These guidelines are specifically for AI agents working on the codebase. They provide detailed patterns and conventions that may not be obvious from reading the code alone.

For general development guidance, see [CONTRIBUTING.md](../CONTRIBUTING.md).

