# Coding Standards

## Purpose
Keep our focus on code and functionality. Types are for consumer ergonomics and quick sanity checks — not a blocker for implementation speed. When TypeScript helps, use it; when it hinders, bypass locally and move on.

---

## When to Bypass TypeScript

- **Internal tool composition code** (`src/server.tools.ts`):
  - Use localized casts for inferred unions that don’t narrow. Add a short comment explaining intent; tests protect behavior.
  - Prefer `unknown` at boundaries and add runtime guards. Cast only after guards succeed.

- **Schema conversion helpers** (`src/server.schema.ts`):
  - Returning `z.ZodTypeAny` is fine. Don’t fight generics here.
  - Keep permissive fallbacks (`z.any()`) and avoid deep type plumbing.

- **Tools Host IPC** (`src/server.toolsHost.ts`):
  - Dynamic import + `any` for deserialized payloads is acceptable. Runtime checks and try/catch are the safety net.

- **Test fixtures and E2E clients**:
  - Use `// @ts-ignore` or `as any` where tests intentionally exercise built dist/ outputs or where typings aren’t the point under test.

---

## Core Principles

- **Generics should be reserved**:
  - Reserved for public exported functions/typings. If they reduce readability, prefer concrete typings.

- **Prefer `unknown` over `any`**:
  - `unknown` is the default at boundaries; add runtime guards and narrow.
  - `any` is still acceptable in testing or deserialization where validating functionality is the priority.

- **Keep types simple**:
  - Focus on code and functionality, not exhaustive type modeling.

- **Prefer inference over explicit returns**:
  - Let inference work unless the function/type is part of the public surface.

---

## Practical Patterns

### Local cast after runtime filter
```typescript
const namesMaybe = creators.map(getName).filter(Boolean);
const names = namesMaybe as string[]; // Narrow by intent; unit tests enforce behavior
```

### Boundary guard with unknown
```typescript
function isToolDescriptor(v: unknown): v is ToolDescriptor { /* runtime checks */ }
const desc = input as unknown;
if (!isToolDescriptor(desc)) throw new Error('bad descriptor');
```

### IPC deserialization
```typescript
const mod: any = await dynamicImport(spec);
const creators = normalizeToCreators(mod); // handles bad shapes internally
```
