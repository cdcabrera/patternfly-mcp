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
5. Update documentation if needed
6. Submit a pull request with a clear description

## Code Standards

### TypeScript

- Use TypeScript for all new code
- Follow existing type patterns
- Export types when they're part of the public API
- Use `type` for type aliases, `interface` for object shapes

### ESLint

- Follow the project's ESLint configuration
- Run `npm run test:lint-fix` to auto-fix issues
- All code must pass linting before submission

### Testing

- Write tests for new features
- Maintain or update existing tests when modifying code
- Unit tests go in `src/__tests__/`
- Integration tests go in `tests/`
- Use snapshots for stable outputs
- Run `npm test` before submitting

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

### Testing Strategy

- **Unit Tests**: Test individual functions and modules in `src/__tests__/`
- **Integration Tests**: Test complete server behavior in `tests/`
- **Snapshots**: Used for stable outputs (tool schemas, server responses)
- **Fixtures**: Test data in `tests/__fixtures__/` and `src/__tests__/__fixtures__/`

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

### Server Transport

The server supports two transport modes:

- **stdio** (default): Standard input/output for MCP clients
- **http**: HTTP transport using StreamableHTTPServerTransport

Transport selection is based on the `options.http` flag in `src/server.ts`.

## Review Process

- All pull requests require review
- Address review feedback promptly
- Keep pull requests focused and reasonably sized
- Update documentation for user-facing changes

## For AI Agents

AI agents working on this codebase should refer to the [guidelines/](./guidelines/) directory for detailed patterns, conventions, and codebase-specific guidance.

## Questions?

If you have questions about contributing, please:
- Check the [guidelines/](./guidelines/) directory for detailed patterns
- Review existing code for examples
- Open an issue for discussion

Thank you for contributing! 🎉

