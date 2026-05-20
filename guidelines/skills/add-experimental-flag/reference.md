# Experimental Flag Reference

## Registry (`src/index.ts`)

Add your internal key name (camelCase) to both locations:

```typescript
type PfMcpExperimentalOptions = 'existingFlag' | 'yourNewFlag';

const EXPERIMENTAL_OPTIONS = new Set<ExperimentalOptionKey>([
  'existingFlag',
  'yourNewFlag'
]);
```

## Defaults (`src/options.defaults.ts`)

```typescript
export interface DefaultOptions {
  // ...
  yourNewFlag: boolean;
}

export const DEFAULT_OPTIONS: DefaultOptions = {
  // ...
  yourNewFlag: false,
};
```

## CLI Parsing (`src/options.ts`)

```typescript
export type CliOptions = {
  // ...
  yourNewFlag?: boolean;
};

// Inside parseCliOptions switch:
case '--your-new-flag':
  result.yourNewFlag = true;
  break;
```

## Testing Patterns

### Unit Test (`src/__tests__/options.test.ts`)
Verify that the parser correctly maps the prefixed flag to the internal key.

```typescript
{
  description: 'with experimental your-new-flag',
  args: ['node', 'cli', '--experimental-your-new-flag'],
  experimentalOptions: new Set(['yourNewFlag']),
  expectedOptions: expect.objectContaining({ yourNewFlag: true }),
  expectedExperimental: ['yourNewFlag']
}
```

### E2E Test (`tests/e2e/stdioTransport.test.ts`)
Verify the server behavior when the flag is active.

```typescript
it('should perform X when --experimental-your-new-flag is provided', async () => {
  const client = await startServer({
    args: ['--experimental-your-new-flag']
  });
  // ... verification logic ...
  await client.stop();
});
```
