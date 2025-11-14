# Testing Strategy Guidelines

Guidelines for testing in the PatternFly MCP Server codebase.

## Test Organization

### Unit Tests (`src/__tests__/`)

- Test individual functions and modules
- Use Jest with TypeScript
- Follow naming: `<module>.test.ts`
- Use snapshots for stable outputs

### Integration Tests (`tests/`)

- Test complete server behavior
- Test transport modes (stdio, HTTP)
- Use test clients from `tests/utils/`
- Follow naming: `<feature>.test.ts`

## Test Patterns

### Unit Test Structure

```typescript
import { functionToTest } from '../module';

describe('moduleName', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something', () => {
    // Test
    expect(result).toMatchSnapshot();
  });
});
```

### Integration Test Structure

```typescript
import { startHttpServer } from './utils/httpTransportClient';

describe('Feature', () => {
  let client: HttpTransportClient;

  afterEach(async () => {
    if (client) {
      await client.close();
    }
  });

  it('should work', async () => {
    client = await startHttpServer();
    // Test
  });
});
```

## Snapshot Testing

Use snapshots for:
- Tool schemas
- Server responses
- Configuration outputs
- Stable data structures

**Update snapshots**: `npm test -- -u`

## Test Fixtures

- **Unit test fixtures**: `src/__tests__/__fixtures__/`
- **Integration test fixtures**: `tests/__fixtures__/`

## Mocking

- Mock external dependencies (MCP SDK, Node.js modules)
- Use Jest mocks for modules
- Keep mocks in test files or `__mocks__/` directories

## Running Tests

- **All tests**: `npm test`
- **Unit tests only**: `npm test -- src/__tests__/`
- **Integration tests**: `npm run test:integration`
- **Watch mode**: `npm run test:dev`
- **Update snapshots**: `npm test -- -u`

## Test Coverage

- Aim for high coverage of core functionality
- Focus on critical paths (server startup, tool execution, error handling)
- Integration tests cover end-to-end scenarios

