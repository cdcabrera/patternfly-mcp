# Contributing to PatternFly MCP Server

## Developer Setup

1. **Clone & Install**:
   ```bash
   git clone https://github.com/patternfly/patternfly-mcp.git
   cd patternfly-mcp
   npm install
   ```

2. **Build & Run**:
   ```bash
   npm run build
   npm run start:dev # Watch mode
   ```

<details>
<summary><strong>Git Workflow & Standards</strong></summary>

### Branch Naming
Follow the `YYYYMMDD-feature-name` pattern.
- Feature: `20260116-add-new-tool`
- Fix: `20260116-fix-caching-bug`

### Commit Messages
We strictly follow **Conventional Commits**:
- `feat(scope): description`
- `fix(scope): description`

</details>

<details>
<summary><strong>Testing Strategy</strong></summary>

- **Unit Tests**: `npm test` (located in `src/__tests__/`)
- **Integration Tests**: `npm run test:integration`

</details>
