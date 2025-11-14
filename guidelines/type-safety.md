# Type Safety Guidelines

Guidelines for TypeScript usage in the PatternFly MCP Server codebase.

## Type Patterns

### Type vs Interface

- **`interface`**: For object shapes that may be extended
- **`type`**: For unions, intersections, aliases

**Example**:
```typescript
interface ServerInstance {
  stop(): Promise<void>;
  isRunning(): boolean;
}

type McpTool = [string, { description: string; inputSchema: any }, (args: any) => Promise<any>];
```

### Type Exports

Use `export type` for type-only exports:

```typescript
export type { ServerInstance, McpTool, GlobalOptions };
```

### Optional Properties

Use `exactOptionalPropertyTypes: true` (in tsconfig.json):

```typescript
// ✅ Correct
const obj = { prop: value || undefined };
// Or conditionally include
const obj = { ...(condition && { prop: value }) };

// ❌ Wrong (with exactOptionalPropertyTypes)
const obj = { prop: condition ? value : undefined };
```

## Type Safety Patterns

### Function Parameters

- Use explicit types for function parameters
- Use `Partial<>` for optional overrides
- Use default parameters with `getOptions()`

**Example**:
```typescript
const myFunction = (options = getOptions()): ReturnType => {
  // Implementation
};
```

### Tool Callbacks

Tool callbacks use `any` for args (MCP SDK requirement):

```typescript
const callback = async (args: any = {}) => {
  // Validate args
  const { param } = args;
  // Implementation
};
```

### Options Types

Options follow a hierarchy:

```typescript
interface CliOptions { /* CLI-only options */ }
interface DefaultOptions { /* Default values */ }
interface GlobalOptions extends CliOptions, DefaultOptions { /* Combined */ }
```

## Type Guards

Use type guards for runtime validation:

```typescript
function isValidPort(port: unknown): port is number {
  return typeof port === 'number' && port >= 1 && port <= 65535;
}
```

## Type Assertions

Avoid type assertions when possible. Use type guards or proper typing instead.

## Generic Types

Use generics for reusable patterns:

```typescript
const memo = <TArgs extends any[], TReturn>(
  func: (...args: TArgs) => TReturn,
  options: MemoOptions
): (...args: TArgs) => TReturn => {
  // Implementation
};
```

