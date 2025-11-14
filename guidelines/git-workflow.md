# Git Workflow Guidelines

Guidelines for Git workflow in the PatternFly MCP Server codebase.

## Branch Naming

Use date-prefixed branch names:

- **Feature**: `YYYYMMDD-feature-name`
  - Example: `20251021-http-transport`
- **Fix**: `YYYYMMDD-fix-description`
  - Example: `20251022-fix-options-context`
- **Refactor**: `YYYYMMDD-refactor-component`
  - Example: `20251023-refactor-server-init`
- **Test**: `YYYYMMDD-test-feature`
  - Example: `20251024-test-http-transport`
- **Docs**: `YYYYMMDD-docs-update`
  - Example: `20251025-docs-architecture`

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

**Format**: `<type>: <description>`

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `test`: Test additions/changes
- `docs`: Documentation changes
- `chore`: Maintenance tasks

**Examples**:
- `feat: add http transport support`
- `fix: resolve options context isolation issue`
- `refactor: simplify server initialization`
- `test: add integration tests for http transport`
- `docs: update README with quickstart guide`

## Pull Request Process

1. Create feature branch from `main`
2. Make focused, atomic commits
3. Ensure all tests pass: `npm test`
4. Ensure linting passes: `npm run test:lint`
5. Update documentation if needed
6. Submit PR with clear description

## Commit Guidelines

- **Atomic commits**: One logical change per commit
- **Clear messages**: Describe what and why, not how
- **Related changes**: Group related changes together
- **Test commits**: Include tests with features/fixes

## Branch Management

- **Main branch**: Production-ready code
- **Feature branches**: Short-lived, merged after review
- **No force push**: To main branch
- **Clean history**: Rebase/squash before merge if needed

