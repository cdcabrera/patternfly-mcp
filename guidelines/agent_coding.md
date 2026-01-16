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

### When to Bypass TypeScript (Localized Opt-out)

Specific modules allow bypassing strict typing to maintain momentum:

- **Internal tool composition** (`src/server.tools.ts`): Use localized casts for inferred unions that don't narrow. Add a short comment explaining intent.
- **Schema conversion** (`src/server.schema.ts`): Returning `z.ZodTypeAny` is fine. Avoid deep type plumbing.
- **Tools Host IPC** (`src/server.toolsHost.ts`): `any` for deserialized payloads is acceptable. Runtime checks and try/catch are the safety net.
- **Test fixtures and E2E clients**: Use `// @ts-ignore` or `as any` where tests exercise built outputs or where typings aren’t the point under test.

## 2. Architectural Patterns

The project follows a plugin-based architecture as described in [docs/architecture.md](../docs/architecture.md).

### The "Creator" Pattern

Tools and resources follow a creator pattern to allow dependency injection and configuration. This pattern is essential for both built-in and [custom tool plugins](../docs/development.md#mcp-tool-plugins).

- **Example**: `usePatternFlyDocsTool(options = getOptions()): McpTool`
- This ensures consistency and makes unit testing easier by allowing mock options.

### Tool Authoring

When authoring or updating tools, refer to [docs/development.md#authoring-tools](../docs/development.md#authoring-tools) for schema and handler requirements.

### Module Organization

- **File Names**: Use `lowerCamelCase` with dot notation (e.g., `server.http.ts`). See [file structure](../CONTRIBUTING.md#file-structure) guidance.
- **Single Responsibility**: Functions should attempt to maintain a single responsibility. See [functionality conventions](../CONTRIBUTING.md#functionality-testing).
- **Minimal JSDoc**: Focus on clear descriptions; avoid exhaustive tag redundancy.

### Resource Loading & Concurrency

- Use `processDocsFunction` for multi-file loading to leverage the `promiseQueue`.
- Respect `maxDocsToLoad` and `recommendedMaxDocsToLoad` limits to prevent OOM.
- All network fetches should use `fetchUrlFunction` for consistent timeout and error handling.
