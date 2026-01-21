# Agent Coding

## Overview

Coding standards and architectural patterns for the PatternFly MCP project. This document emphasizes maintainability, performance, and pragmatic TypeScript usage.

## For Agents

### Processing Priority

High - This document should be processed when working with source code or implementing features.

### Related Guidelines

See the [Guidelines Index](./README.md#guidelines-index) for all guidelines.

## 1. TypeScript Standards

Adhere to the [TypeScript coding conventions](../CONTRIBUTING.md#typescript) established for the project.

### Core Principles

- **Pragmatic Over Perfection**: Focus on code and functionality. Types are for consumer ergonomics and quick sanity checks — not a blocker for implementation speed.
- **Generics should be reserved**: Use for public exported functions/typings. If they reduce readability, prefer concrete typings.
- **Prefer `unknown` over `any`**: `unknown` is the default at boundaries; add runtime guards and narrow. `any` is still acceptable in testing or deserialization (IPC).
- **Prefer inference over explicit returns**: Let inference work unless the function/type is part of the public surface.

### Strict ESM Enforcement

The project is strictly ESM. Agents MUST follow these rules:
- **Exports**:
    - **Internal Source Code (TypeScript)**: Favor named exports (e.g., `export { foo }`).
    - **External Tool Plugins (JavaScript)**: MUST use `export default` for the tool definition.
- **Explicit Extensions**:
    - **Internal Source Code (TypeScript)**: Use extension-less imports for local modules (e.g., `import { foo } from './foo'`).
    - **External Tool Plugins (JavaScript)**: All relative imports MUST include explicit file extensions (e.g., `import { foo } from './foo.js'`) as they are loaded by the Node.js ESM runtime.
- **No CommonJS**: Do not use `require()`, `module.exports`, or `__dirname`.

### When to Bypass TypeScript (Localized Opt-out)

Specific modules allow bypassing strict typing to maintain momentum:

- **Internal tool composition** (`src/server.tools.ts`): Use localized casts for inferred unions that don't narrow. Add a short comment explaining intent.
- **Schema conversion** (`src/server.schema.ts`): Returning `z.ZodTypeAny` is fine. Avoid deep type plumbing.
- **Tools Host IPC** (`src/server.toolsHost.ts`): `any` for deserialized payloads is acceptable. Runtime checks and try/catch are the safety net.
- **Test fixtures and E2E clients**: Use `// @ts-ignore` or `as any` where tests exercise built outputs or where typings aren’t the point under test.

## 2. Architectural Patterns

The project follows a plugin-based architecture as described in [docs/architecture.md](../docs/architecture.md).

### Alignment and Planning

Before implementing any coding changes, agents MUST verify that the proposed changes align with the project's [system architecture and roadmap](../docs/architecture.md).

### Tool Authoring

When authoring or updating tools, refer to [docs/development.md#authoring-tools](../docs/development.md#authoring-tools) for schema and handler requirements.

### Module Organization

- **File Names**:
    - **Internal Source Code**: Use `lowerCamelCase` with dot notation (e.g., `server.http.ts`, `tool.patternFlyDocs.ts`). See [file structure](../CONTRIBUTING.md#file-structure) guidance.
        - **Prefixes**: 
          - `server.*` - Core server functionality (transport, tools, resources, caching)
          - `tool.*` - Built-in tool implementations
          - `resource.*` - Built-in resource implementations
          - `options.*` - Configuration and options management
          - `docs.*` - Documentation processing utilities
    - **External Tool Plugins / Examples**: Use `lowerCamelCase` with descriptive prefixes (e.g., `toolPluginHelloWorld.js`, `embeddedBasic.js`).
- **Single Responsibility**: Functions should attempt to maintain a single responsibility. See [functionality conventions](../CONTRIBUTING.md#functionality-testing).
- **JSDoc Documentation**: Use comprehensive JSDoc for public APIs. See [JSDoc Standards](#jsdoc-documentation-standards) below.

### Export Patterns

**Internal Source Code (TypeScript):**
- Use **named exports** for all exports
- Group exports at the end of the file
- Export types alongside their related values
- Export related functions together

**Pattern:**
```typescript
// At end of file
export {
  createMcpTool,
  normalizeTools,
  type ToolCreator,
  type ToolModule,
  type ToolConfig
};
```

**What to Export:**
- Public APIs (functions, classes, types used by other modules)
- Creator functions for tools/resources
- Utility functions used across modules
- Types/interfaces used in public APIs

**What NOT to Export:**
- Internal helper functions (unless used by tests)
- Implementation details
- Private constants (unless needed for testing)

**External Tool Plugins (JavaScript):**
- MUST use `export default` for the tool definition
- Can use named exports for internal utilities (if needed)

**Pattern:**
```typescript
// External tool plugin
import { createMcpTool } from '@patternfly/patternfly-mcp';

export default createMcpTool({
  name: 'myTool',
  // ...
});
```

### Resource Loading & Concurrency

- Use `processDocsFunction` for multi-file loading to leverage the `promiseQueue`.
- Respect `maxDocsToLoad` and `recommendedMaxDocsToLoad` limits to prevent OOM.
- All network fetches should use `fetchUrlFunction` for consistent timeout and error handling.

### The "Creator" Pattern

Tools and resources follow a creator pattern for dependency injection and testability:

- **Structure**: Creator functions accept optional `options` parameter (defaults to `getOptions()`) and return tool/resource tuples.
- **Internal Tools**: `(options = getOptions()): McpTool` - Returns `[name, schema, handler]` tuple.
- **Internal Resources**: `(options = getOptions()): McpResource` - Returns `[name, uri, config, handler]` tuple.
- **Testing**: Mock options in tests: `const tool = usePatternFlyDocsTool(mockOptions)`.
- **Memoization**: Creators themselves are not memoized; internal functions they use may be memoized (e.g., `getComponentSchema.memo`).

## 3. Common Patterns

### Memoization

The codebase uses a custom memoization system for performance optimization. Functions are memoized by assigning a `.memo` property.

**When to Memoize:**
- Expensive computations (network requests, file I/O, schema processing)
- Functions called repeatedly with same arguments
- Functions that benefit from caching (e.g., `getComponentSchema`, `searchComponents`)

**Pattern:**
```typescript
const expensiveFunction = async (arg: string) => {
  // ... expensive operation
};

expensiveFunction.memo = memo(expensiveFunction, {
  cacheLimit: 10,
  cacheErrors: true,
  keyHash: (args) => args[0] // Custom hash function
});
```

**Configuration Options:**
- `cacheLimit`: Number of entries before rolling off (default: 1)
- `cacheErrors`: Whether to cache errors (default: true)
- `keyHash`: Custom hash function for cache keys (default: `generateHash`)
- `expire`: Cache expiration in milliseconds
- `onCacheRollout`: Callback when entries are removed due to cache limit

**Usage:**
```typescript
// Call memoized function
const result = await getComponentSchema.memo('Button');

// Access memo internals (for testing/debugging)
const { getKey } = getComponentSchema.memo();
```

**Best Practices:**
- Use `cacheErrors: false` for normalization functions that should retry on error
- Use custom `keyHash` for stable hashing when arguments are complex objects
- Set appropriate `cacheLimit` based on expected unique argument combinations

### Context Management

The codebase uses `AsyncLocalStorage` for managing session and options context without explicit parameter passing.

**Session Context:**
- **Purpose**: Per-instance session state (sessionId, channelName, publicSessionId)
- **Access**: `getSessionOptions()` - Gets current session or creates new one
- **Run with Session**: `runWithSession(session, callback)` - Executes callback with specific session
- **Initialization**: Automatically initialized on first access

**Options Context:**
- **Purpose**: Per-instance global options (merged from CLI, programmatic, and defaults)
- **Access**: `getOptions()` - Gets current options or creates from defaults
- **Set Options**: `setOptions(overrides)` - Merges overrides with defaults and freezes
- **Run with Options**: `runWithOptions(options, callback)` - Executes callback with specific options

**Pattern:**
```typescript
// In a tool creator
const myTool = (options = getOptions()): McpTool => {
  // options is automatically available from context if not provided
  const session = getSessionOptions(); // Access session if needed
  
  return [name, schema, handler];
};

// In server startup
const session = getSessionOptions();
await runWithSession(session, async () => {
  // All code in this callback has access to session via getSessionOptions()
  await runServer(options);
});
```

**Best Practices:**
- Always provide `options` parameter with default `getOptions()` in creator functions
- Use `runWithSession`/`runWithOptions` when you need to override context temporarily
- Context is automatically available in nested async functions - no need to pass explicitly

### Error Handling

**MCP Errors:**
- Use `McpError` from `@modelcontextprotocol/sdk/types.js` for tool/resource errors
- Use appropriate `ErrorCode` enum values: `InvalidParams`, `InternalError`, `MethodNotFound`, etc.
- Provide user-friendly error messages

**Pattern:**
```typescript
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

if (!name || typeof name !== 'string') {
  throw new McpError(
    ErrorCode.InvalidParams,
    `Missing required parameter: name must be a string`
  );
}
```

**Suggestive Failure:**
When a resource is not found, suggest alternatives:
```typescript
const { exactMatches, searchResults } = searchComponents.memo(name);

if (exactMatches.length === 0) {
  const suggestions = searchResults.map(r => r.item).slice(0, 3);
  const suggestionMessage = suggestions.length
    ? `Did you mean ${suggestions.map(s => `"${s}"`).join(', ')}?`
    : 'No similar components found.';
  
  throw new McpError(
    ErrorCode.InvalidParams,
    `No documentation found for "${name}". ${suggestionMessage}`
  );
}
```

**Error Serialization (IPC):**
- For Tools Host IPC, errors are serialized using `serializeError` and `isErrorLike`
- Errors must be serializable (no circular references, functions, etc.)
- Use `ErrorCode` in serialized errors for proper error handling

**Regular Errors:**
- Use regular `Error` for internal failures, logging, and non-user-facing errors
- Use `McpError` for errors that should be returned to MCP clients

### Helper Functions

Common utilities are centralized in `server.helpers.ts`. Use these instead of reinventing:

**Available Helpers:**
- `freezeObject(obj)`: Deep freeze object for immutability (used for options/session)
- `stringJoin.basic(...strings)`: Join strings with space separator
- `stringJoin.newline(...strings)`: Join strings with newline separator
- `isPlainObject(obj)`: Type guard for plain objects (not arrays, dates, etc.)
- `isObject(obj)`: Type guard for any object
- `mergeObjects(base, source, options)`: Deep merge objects with pollution protection
- `timeoutFunction(func, ms)`: Wrap async function with timeout
- `isUrl(str)`: Check if string is a valid URL
- `portValid(port)`: Validate port number
- `hashCode(str, options)`: Generate hash from string
- `hashNormalizeValue(value)`: Normalize value for consistent hashing

**When to Create New Helpers:**
- Function is used in 3+ places
- Function encapsulates non-trivial logic
- Function needs to be tested independently
- Function follows existing helper patterns

**Pattern:**
```typescript
import { stringJoin, isPlainObject } from './server.helpers';

// Use helpers instead of manual string concatenation
const message = stringJoin.newline(
  '# Documentation',
  '',
  content
);

// Use type guards for runtime checks
if (isPlainObject(value)) {
  // TypeScript knows value is Record<string, unknown>
}
```

### Schema Normalization

The codebase supports both JSON Schema and Zod schemas, with automatic conversion.

**Schema Types:**
- **Zod Schema**: Direct Zod schema instance (e.g., `z.object({ name: z.string() })`)
- **Zod Raw Shape**: Object with Zod schemas as values (e.g., `{ name: z.string() }`)
- **JSON Schema**: Plain object following JSON Schema spec

**Normalization:**
- `normalizeInputSchema(schema)`: Converts any schema type to Zod schema
- Automatically handles: Zod → Zod, Raw Shape → `z.object()`, JSON Schema → Zod (via `fromJSONSchema`)
- Used internally by `createMcpTool` and tool creators

**Pattern:**
```typescript
import { normalizeInputSchema } from './server.schema';

// In tool creator
const inputSchema = normalizeInputSchema({
  type: 'object',
  properties: { name: { type: 'string' } }
});
// Returns Zod schema compatible with MCP SDK
```

**Type Guards:**
- `isZodSchema(value)`: Check if value is a Zod schema
- `isZodRawShape(value)`: Check if value is object of Zod schemas

**Best Practices:**
- Prefer Zod schemas for new code (better TypeScript integration)
- JSON Schema is acceptable for external tool plugins
- Use `normalizeInputSchema` when accepting schemas from external sources

### Type Guards

Extensive use of type guards for runtime type checking and TypeScript narrowing.

**Common Type Guards:**
- `isPlainObject(obj)`: Plain object (not array, date, etc.)
- `isObject(obj)`: Any object
- `isReferenceLike(value)`: Object or function (not null or primitive)
- `isZodSchema(value)`: Zod schema instance
- `isZodRawShape(value)`: Object with Zod schemas as values
- `isErrorLike(value)`: Error or error-like object
- `isPromise(value)`: Promise instance
- `isAsync(func)`: Async function

**Pattern:**
```typescript
import { isPlainObject, isZodSchema } from './server.helpers';
import { isZodSchema as isZod } from './server.schema';

function processValue(value: unknown) {
  if (isPlainObject(value)) {
    // TypeScript knows: value is Record<string, unknown>
    return Object.keys(value);
  }
  
  if (isZodSchema(value)) {
    // TypeScript knows: value is a Zod schema
    return value.parse(data);
  }
}
```

**Creating Type Guards:**
- Return type: `value is Type`
- Use `Object.prototype.toString.call()` for cross-realm checks
- Check for required properties/methods
- Name should start with `is` or `has`

**Best Practices:**
- Use existing type guards from `server.helpers.ts` when available
- Create new type guards for domain-specific types
- Combine multiple guards for complex narrowing

### Immutability

Options and session objects are frozen to prevent accidental mutations.

**Pattern:**
```typescript
import { freezeObject } from './server.helpers';

const session = freezeObject({
  sessionId: '...',
  channelName: '...'
});
// session is now immutable - mutations will fail in strict mode
```

**When to Freeze:**
- Options objects (merged from defaults + overrides)
- Session objects
- Configuration objects passed through context
- Any object that should not be mutated after creation

**Best Practices:**
- Use `structuredClone` before freezing if you need to modify first
- Freeze at the boundary (when setting context, not in every function)
- Document frozen objects in JSDoc with `@readonly` or similar

### Timeout Patterns

Use `timeoutFunction` for async operations that should have timeouts.

**Pattern:**
```typescript
import { timeoutFunction } from './server.helpers';

const fetchWithTimeout = timeoutFunction(fetchUrl, 5000);
const result = await fetchWithTimeout(url);
```

**When to Use:**
- Network requests (already handled by `fetchUrlFunction`)
- External tool plugin invocations
- Any async operation that could hang indefinitely

**Best Practices:**
- Set reasonable timeouts based on operation type
- Document timeout values in options/defaults
- Handle timeout errors gracefully with user-friendly messages

### Validation and Sanitization

Input validation and sanitization are critical for security and reliability.

**Sanitization Functions:**
- `sanitizePlainObject(obj, allowedKeys)`: Remove disallowed keys from plain objects
- `sanitizeDataProp(value)`: Sanitize data properties (removes functions, circular refs)
- `sanitizeStaticToolName(name)`: Validate and sanitize tool names

**Pattern:**
```typescript
import { sanitizePlainObject, isPlainObject } from './server.helpers';

const ALLOWED_KEYS = ['name', 'description', 'inputSchema', 'handler'];

function normalizeToolConfig(config: unknown) {
  if (!isPlainObject(config)) {
    return undefined;
  }
  
  // Remove any disallowed keys
  const sanitized = sanitizePlainObject(config, ALLOWED_KEYS);
  
  // Validate required fields
  if (!sanitized.name || !sanitized.handler) {
    return undefined;
  }
  
  return sanitized;
}
```

**Input Validation:**
- Validate at boundaries (tool handlers, resource handlers)
- Use type guards before processing
- Check for required fields early
- Provide clear error messages for invalid input

**Pattern:**
```typescript
async handler(args: unknown) {
  // Validate input type
  if (!isPlainObject(args)) {
    throw new McpError(ErrorCode.InvalidParams, 'Args must be an object');
  }
  
  // Validate required fields
  const { name } = args;
  if (!name || typeof name !== 'string') {
    throw new McpError(
      ErrorCode.InvalidParams,
      'Missing required parameter: name must be a string'
    );
  }
  
  // Validate format/content
  if (name.trim().length === 0) {
    throw new McpError(ErrorCode.InvalidParams, 'Name cannot be empty');
  }
  
  // Process validated input
  return processName(name.trim());
}
```

**Security Considerations:**
- Always sanitize user input before processing
- Use `sanitizePlainObject` to prevent prototype pollution
- Validate file paths to prevent directory traversal
- Never trust external input - validate and sanitize everything

**Best Practices:**
- Validate early, fail fast with clear error messages
- Use type guards for runtime type checking
- Sanitize objects before merging or cloning
- Document validation requirements in JSDoc

## 4. JSDoc Documentation Standards

While the codebase emphasizes pragmatism, **public APIs require comprehensive JSDoc** for consumer ergonomics.

### Required Tags for Public APIs

- **`@param`**: Document all parameters with types and descriptions
- **`@returns`**: Document return type and what the function returns
- **`@throws`**: Document all possible errors (especially `McpError` cases)
- **`@template`**: Document generic type parameters
- **`@example`**: Provide usage examples for complex functions
- **`@note`**: Important implementation details or gotchas

### Tag Format

**Parameters:**
```typescript
/**
 * @param name - Component name to fetch documentation for
 * @param options - Optional configuration object
 * @param options.maxDocs - Maximum number of docs to load
 */
```

**Returns:**
```typescript
/**
 * @returns {Promise<McpTool>} MCP tool tuple [name, schema, handler]
 */
```

**Throws:**
```typescript
/**
 * @throws {McpError} If component name is invalid or not found
 * @throws {Error} If network request fails
 */
```

**Templates:**
```typescript
/**
 * @template TReturn Return type of the memoized function
 * @template TArgs Arguments passed to the function
 */
```

**Examples:**
```typescript
/**
 * @example
 * const tool = usePatternFlyDocsTool();
 * const result = await tool[2]({ name: 'Button' });
 */
```

**Notes:**
```typescript
/**
 * @note Use of `any` here is intentional as part of a pass-through policy
 * around inputSchema reconstruction.
 */
```

### Internal Code

For internal (non-exported) functions:
- Use minimal JSDoc: brief description, key parameters, return type
- Focus on "why" not "what" when the code is self-explanatory
- Add `@note` for non-obvious implementation details

### Best Practices

- Keep descriptions concise but informative
- Use TypeScript types in JSDoc when they add clarity
- Update JSDoc when function signatures change
- Include examples for complex or commonly-used functions
- Document error conditions that callers should handle

## 5. Quality Control & Validation

Agents MUST validate all code outputs and examples using the project's quality tools:
- **Linting**: `npm run test:lint`
- **Type Checking**: `npm run test:types`
- **Documentation**: `npm run test:spell-docs`
- **Consistency**: Ensure examples use the same ESLint configuration as the core repository.
