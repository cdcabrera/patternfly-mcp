# PatternFly MCP Server

A Model Context Protocol (MCP) server providing standardized access to PatternFly React development rules, documentation, and technical schemas.

## Quick Start

Run the server immediately via `npx`:

```bash
npx -y @patternfly/patternfly-mcp
```

### MCP Inspector
Visualize and test the MCP interface locally:

```bash
npx -y @modelcontextprotocol/inspector npx @patternfly/patternfly-mcp
```

## CLI Options

| Flag | Description | Default |
| :--- | :--- | :--- |
| `--http` | Enable HTTP transport mode | `false` (stdio) |
| `--port <num>` | Port for HTTP transport | `8080` |
| `--tool <path>` | Path to external Tool Plugin (repeatable) | `none` |
| `--log-stderr` | Enable terminal logging | `false` |
| `--verbose` | Shortcut for `--log-level debug` | `false` |

## Documentation

- **[Usage Guide](./docs/usage.md)**: Built-in tools, resources, and client configurations.
- **[Architecture](./docs/architecture.md)**: Technical design, patterns, and future roadmap.
- **[Examples](./docs/examples/README.md)**: Copy-pasteable integration snippets.
- **[Contributing](./CONTRIBUTING.md)**: Developer setup and contribution standards.

---
**For AI Agents**: Universal guidance for maintaining this repository is located in [guidelines/README.md](./guidelines/README.md).
