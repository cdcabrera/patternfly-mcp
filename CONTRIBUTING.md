# Contributing to PatternFly MCP Server

Thank you for your interest in contributing to the PatternFly MCP Server! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Install dependencies: `npm install`
4. Build the project: `npm run build`
5. Run tests: `npm test`

## Git Workflow

### Branch Naming

We use date-prefixed branch names for better organization:

- **Feature**: `YYYYMMDD-feature-name`
  - Example: `20251021-http-transport`
- **Fix**: `YYYYMMDD-fix-description`
  - Example: `20251022-fix-options-context`
- **Refactor**: `YYYYMMDD-refactor-component`
  - Example: `20251023-refactor-server-init`

### Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/) format:

- `feat: add http transport support`
- `fix: resolve options context isolation issue`
- `refactor: simplify server initialization`
- `test: add integration tests for http transport`
- `docs: update README with quickstart guide`

**Format**: `<type>: <description>`

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `test`: Test additions/changes
- `docs`: Documentation changes
- `chore`: Maintenance tasks

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with clear, focused commits
3. Ensure all tests pass: `npm test`
4. Ensure linting passes: `npm run test:lint`
5. Ensure type checking passes: `npm run test:types`
6. Update documentation if needed
7. Submit a pull request with a clear description

## Code Standards

### TypeScript

- Use TypeScript for all new code
- Follow existing type patterns
- Export types when they're part of the public API
- Use `type` for type aliases, `interface` for object shapes
- Follow strict TypeScript configuration (see `tsconfig.json`)

### ESLint

- Follow the project's ESLint configuration (`eslint.config.js`)
- Run `npm run test:lint-fix` to auto-fix issues
- All code must pass linting before submission
- Use type imports: `import { type MyType } from './module'`

### Testing

- Write tests for new features
- Maintain or update existing tests when modifying code
- Unit tests go in `src/__tests__/`
- Integration tests go in `tests/`
- Use snapshots for stable outputs (tool schemas, server responses)
- Run `npm test` before submitting
- Run `npm run test:integration` for end-to-end tests

**Test Commands**:
- `npm test` - Run unit tests with linting and type checking
- `npm run test:dev` - Run tests in watch mode
- `npm run test:integration` - Run integration tests
- `npm run test:integration-dev` - Run integration tests in watch mode
- `npm run test:lint` - Run ESLint only
- `npm run test:types` - Run TypeScript type checking only

## Codebase-Specific Notes

### Options Context System

The codebase uses `AsyncLocalStorage` for per-instance options isolation. This allows multiple server instances to run with different options without conflicts.

- Options are set via `setOptions()` in `src/options.context.ts`
- Options are accessed via `getOptions()` within async contexts
- Options are automatically merged with defaults
- Options are frozen after being set

**Key Files**:
- `src/options.context.ts` - Context management
- `src/options.ts` - CLI option parsing
- `src/options.defaults.ts` - Default values

**Important**: Always use `getOptions()` within async functions, not at module level.

### Testing Strategy

- **Unit Tests**: Test individual functions and modules in `src/__tests__/`
- **Integration Tests**: Test complete server behavior in `tests/`
- **Snapshots**: Used for stable outputs (tool schemas, server responses)
- **Fixtures**: Test data in `tests/__fixtures__/` and `src/__tests__/__fixtures__/`

**Test Patterns**:
- Use Jest for testing
- Mock external dependencies
- Test both success and error cases
- Use snapshots for tool schemas and responses

### Tool Pattern

MCP tools follow a tuple pattern:

```typescript
type McpTool = [
  string,                                    // Tool name
  { description: string; inputSchema: any }, // Tool schema
  (args: any) => Promise<any>                 // Tool callback
];
```

All tools are created via tool creator functions that accept options:

```typescript
const myTool = (options = getOptions()): McpTool => {
  const callback = async (args: any = {}) => {
    // Tool implementation
  };
  
  return ['toolName', { description: '...', inputSchema: {...} }, callback];
};
```

**For new tools**: Use `createMcpTool` helper from `@patternfly/patternfly-mcp` for normalization.

### Server Transport

The server supports two transport modes:

- **stdio** (default): Standard input/output for MCP clients
- **http**: HTTP transport using StreamableHTTPServerTransport

Transport selection is based on the `options.isHttp` flag in `src/server.ts`.

**Key Files**:
- `src/server.ts` - Main server implementation
- `src/server.http.ts` - HTTP transport implementation

### Memoization System

The codebase uses a two-tier memoization system:

- **Resource-level**: Shared across tools (file reads, URL fetches)
- **Tool-level**: Tool-specific caching

**Implementation**: `src/server.caching.ts`

**When adding memoization**:
- Use the `memo()` helper function
- Configure cache limits and expiration
- Consider cache rolloff callbacks for cleanup

### Logging System

The server uses `diagnostics_channel`–based logging:

- Keeps STDIO stdout pure (required for MCP)
- Use `log.debug()`, `log.info()`, `log.warn()`, `log.error()` from `src/logger.ts`
- Never use `console.log()` in runtime code (protects STDIO)

**Key Files**:
- `src/logger.ts` - Logging utilities
- `src/server.logger.ts` - Server logging setup

## Development Scripts

### Build

- `npm run build` - Build the project (cleans dist, type-checks, bundles)
- `npm run build:clean` - Clean the dist directory
- `npm run build:watch` - Build in watch mode

### Development

- `npm run start:dev` - Run with `tsx` in watch mode (development)
- `npm start` - Run the built server

### Testing

- `npm test` - Run linting, type-check, and unit tests
- `npm run test:dev` - Run tests in watch mode
- `npm run test:integration` - Run integration tests
- `npm run test:integration-dev` - Run integration tests in watch mode
- `npm run test:lint` - Run ESLint
- `npm run test:lint-fix` - Run ESLint with auto-fix
- `npm run test:types` - TypeScript type-check only

## File Organization

### Source Files (`src/`)

- `index.ts` - Entry point, exports public API
- `cli.ts` - CLI entry point
- `server.ts` - Main server implementation
- `server.*.ts` - Server utilities (caching, HTTP, logging, stats, tools, etc.)
- `tool.*.ts` - MCP tool implementations
- `resource.*.ts` - MCP resource implementations
- `options.*.ts` - Options management (context, defaults, parsing)
- `__tests__/` - Unit tests

### Test Files

- `src/__tests__/` - Unit tests
- `tests/` - Integration tests
- `tests/__fixtures__/` - Test fixtures

### Naming Conventions

- **Tools**: `tool.<name>.ts` (e.g., `tool.patternFlyDocs.ts`)
- **Resources**: `resource.<name>.ts` (e.g., `resource.patternFlyContext.ts`)
- **Server modules**: `server.<feature>.ts` (e.g., `server.caching.ts`)
- **Options**: `options.*.ts` (e.g., `options.context.ts`)
- **Tests**: `<module>.test.ts` (e.g., `server.test.ts`)

## Review Process

- All pull requests require review
- Address review feedback promptly
- Keep pull requests focused and reasonably sized
- Update documentation for user-facing changes
- Ensure all tests pass before requesting review

## For AI Agents

AI agents working on this codebase should refer to the `guidelines/` directory (coming soon) for detailed patterns, conventions, and codebase-specific guidance.

The `guidelines/` directory will contain:
- Architecture patterns
- Code organization guidelines
- Testing strategies
- Type safety patterns
- Git workflow details

## Questions?

If you have questions about contributing, please:
- Check the [docs/architecture.md](docs/architecture.md) for architecture details
- Review existing code for examples
- Check the [docs/usage.md](docs/usage.md) for usage patterns
- Open an issue for discussion

Thank you for contributing! 🎉
