# Architecture & Design

## Core Concepts & Patterns

To maintain a resilient and low-maintenance documentation site, the project leverages generalized Node.js and PatternFly features that minimize the need for frequent updates when specific component versions or internal APIs shift.

### Node.js Patterns

*   **Contextual Isolation (`AsyncLocalStorage`)**: Used to maintain per-session configuration (options, logging, stats) without polluting the global scope. This allows multiple server instances to coexist in the same process—critical for embedding and complex testing scenarios.
*   **Sliding Window Concurrency**: The `promiseQueue` implementation avoids the pitfalls of simple batching by maintaining a full pipeline of active requests. This maximizes throughput for network-heavy documentation fetching while strictly adhering to resource limits.
*   **Creator Pattern**: Most core services (tools, resources) follow a creator pattern. Instead of exporting static instances, we export functions that accept configuration and return an initialized service. This facilitates dependency injection and enhances testability.

### PatternFly Integration

*   **Template-Driven Resources**: Documentation and schemas are served via `patternfly://` URI templates. This generalizes component access, allowing the server to dynamically resolve URLs from remote sources (e.g., GitHub raw) rather than relying on local file drift.
*   **Technical Spec Fusion**: Tools like `usePatternFlyDocs` perform automatic "technical specs fusion," combining human-readable Markdown documentation with machine-readable JSON schemas in a single context window for the LLM.

---

## Tools-as-Plugins Architecture

The server implements a robust "Tools-as-Plugins" system that allows extending functionality without modifying the core codebase.

*   **Isolated Execution (Node 22+)**: External tools are executed within a dedicated **Tools Host** child process. This provides security isolation and ensures that faulty plugins cannot crash the main MCP server.
*   **Dynamic Normalization**: The `createMcpTool` helper provides a "normalized" entry point, automatically converting diverse input formats (JSON Schema, Zod) into the strict interface required by the MCP SDK.

### Future Evolution: "X-as-Plugins"
The architecture is designed to eventually support a fully modular, community-driven ecosystem where all core MCP primitives are pluggable:
*   **Resources-as-Plugins**: External contributors can define new `patternfly://` URI resolvers for community components.
*   **Prompts-as-Plugins**: Reusable LLM prompt templates (e.g., "Build a PatternFly Table") can be distributed as independent packages.
*   **Unified Configuration**: Moving towards a YAML/Markdown-based configuration schema to allow users to define their toolchain in a declarative, readable format.

---

## Architectural Layouts

### Current Architecture
The current system focuses on a robust core with managed external tools.

```text
┌───────────────────────────────────────────────────────────┐
│              MCP CLIENT (Claude / Cursor / Whatever)      │
└─────────────────────────────┬─────────────────────────────┘
                              │ stdio / http
┌─────────────────────────────▼─────────────────────────────┐
│                  PATTERNFLY MCP SERVER (Core)             │
│  ┌──────────────────┐  ┌─────────────────┐  ┌──────────┐  │
│  │ Options Context  │  │ Memoization/TTL │  │ Logger   │  │
│  └─────────┬────────┘  └────────┬────────┘  └────┬─────┘  │
│            │                    │                │        │
│  ┌─────────▼────────┐  ┌────────▼────────┐  ┌────▼─────┐  │
│  │  Built-in Tools  │  │ Built-in Res    │  │ Stats    │  │
│  └──────────────────┘  └─────────────────┘  └──────────┘  │
└──────────────┬────────────────────────────────────────────┘
               │ IPC (Isolated)
┌──────────────▼──────────────┐
│       TOOLS HOST (Child)    │
│  ┌──────────┐  ┌──────────┐ │
│  │ External │  │ Plugin B │ │
│  │ Tool A   │  │          │ │
│  └──────────┘  └──────────┘ │
└─────────────────────────────┘
```

### Future Ecosystem: Community-Driven
The future vision transitions the server into a "Plugin Orchestrator" where the community maintains the specialized logic.

```text
┌───────────────────────────────────────────────────────────┐
│              MCP CLIENT (Claude / Cursor / Whatever)      │
└─────────────────────────────┬─────────────────────────────┘
                              │ stdio / http / custom
┌─────────────────────────────▼─────────────────────────────┐
│             PATTERNFLY MCP ORCHESTRATOR (Core)            │
│  ┌─────────────────────────────────────────────────────┐  │
│  │    Declarative Config (YAML / Markdown / JSON)       │  │
│  │    - Defines: Tools, Resources, and Prompts         │  │
│  └──────────────────────────┬──────────────────────────┘  │
│                             │                             │
│  ┌───────────────┐  ┌───────▼────────┐  ┌──────────────┐  │
│  │ Core Runtime  │  │ Plugin Manager │  │ Caching/Auth │  │
│  └───────────────┘  └───────┬────────┘  └──────────────┘  │
└─────────────────────────────┼─────────────────────────────┘
                              │
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
┌───────────────────────┐           ┌───────────────────────┐
│   COMMUNITY PLUGIN A  │           │   COMMUNITY PLUGIN B  │
│ (NPM / Local / Git)   │           │ (NPM / Local / Git)   │
│  ┌─────────────────┐  │           │  ┌─────────────────┐  │
│  │ 🛠️  Tools        │  │           │  │ 🛠️  Tools        │  │
│  │ 📄  Resources    │  │           │  │ 📄  Resources    │  │
│  │ 💡  Prompts      │  │           │  │ 💡  Prompts      │  │
│  └─────────────────┘  │           │  └─────────────────┘  │
└───────────────────────┘           └───────────────────────┘
```

---

## Resource Resolution & Externalization

The server is moving away from the local `documentation/` folder (which is prone to version drift) towards a dynamic **Resource Resolver** pattern.

### Remote-First Strategy
- **Standard Components**: Resolved directly from `patternfly-react` and `patternfly-org` GitHub raw sources.
- **Version Pinning**: The resolver uses the `PF_EXTERNAL_VERSION` (commit hash) defined in `src/options.defaults.ts` to ensure stability.
- **Sync Model**: A planned background sync process will allow for local caching of these remote resources to improve performance while maintaining the "Remote as Source of Truth" model.

---

## Roadmap

### Core Evolution
1.  **3rd Built-in Tool**: Implementation of a specialized "Pattern Discovery" tool to help agents find design patterns across complex multi-component examples.
2.  **Externalized Resources**: Move the remaining static resource logic (mapping URLs to component names) into a pluggable resolver to support version-specific PatternFly documentation sets.

### Ecosystem Expansion
3.  **Specialized MCP Client**: A lightweight, PatternFly-tailored client optimized for documentation browsing. This serves as a reference for developers building their own internal "PatternFly Chat" experiences.
4.  **Tool Auditor (Containerized)**: A standalone environment bundling a model, client, and server. This "Auditor" helps developers rigorously test and validate new Plugins in an isolated, reproducible container.
5.  **Embedded Model Chat**: A possible "all-in-one" distribution including an embedded LLM (e.g., via Llama.cpp), the MCP server, and a web client for local, private design system assistance.
