# Agent Maintenance Guidelines

This directory contains universal guidance for AI agents (Claude, Cursor, Junie) to maintain architectural integrity while contributing to this repository.

## Guidelines Index
1. **[Coding Standards](./coding-standards.md)**: Pragmatic typing and "Functionality over Types."
2. **[Architecture Notes](./architecture-notes.md)**: Implementation details of the Creator Pattern and context isolation.

## Agent Trigger Phrases

Agents should use these phrases as signals to consult specific documentation:

| Task / Intent | Reference Document |
| :--- | :--- |
| **"Adding a new tool"** | Consult `docs/usage.md#authoring-tools` and `docs/examples/tool-plugins.ts`. |
| **"Modifying server lifecycle"** | See `guidelines/architecture-notes.md` regarding `AsyncLocalStorage`. |
| **"Improving Type Safety"** | Follow `guidelines/coding-standards.md` (Functionality > Types). |
| **"Testing with Inspector"** | See `docs/usage.md#testing-with-mcp-inspector`. |
| **"Architectural Shift"** | Review `docs/architecture.md` for current vs. future "X-as-Plugins" models. |
| **"Implementing 3rd Core Tool"** | Refer to `docs/pattern-discovery.md`. |
| **"Testing Plugins in CI"** | See `docs/tool-auditor.md` for the Auditor spec. |
| **"Externalizing Resources"** | Review `docs/architecture.md#resource-resolution--externalization`. |
| **"Unified Configuration"** | See `docs/configuration.md`. |

## Processing Order
1. Check `.agent/` for developer-specific local overrides (if present).
2. Follow `guidelines/` for universal repository standards.
3. Align with `CONTRIBUTING.md` for Git/Commit workflows.
