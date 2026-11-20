# Experimental settings

Opt-in server options documented here are **not** covered by the same stability guarantees as the rest of the docs. They may change behavior, graduate to stable configuration, or be removed without a major release.

**Stable docs:**
- [Usage guide](./usage.md) — default tools, resources, and client configuration
- [Development reference](./development.md) — CLI and programmatic API for supported options

## How experimental options work

- **CLI**: `--experimental-<kebab-name>` (for example, `--experimental-context-management`)
- **Programmatic**: `experimental<CamelName>` on the object passed to `start()` (for example, `experimentalContextManagement: true`)
- **Startup**: The server logs a warning when any registered experimental option is enabled

Using an experimental flag without the `experimental` prefix (CLI or programmatic) is ignored.

## Lifecycle

1. **Experimental** — documented only on this page; behavior may change between releases.
2. **Graduating** — when a flag loses its experimental prefix in code, its documentation moves to [usage](./usage.md) or [development](./development.md) in the same change; remove it from the index below.
3. **Removed** — when a flag fails to graduate, delete the row and section here; stable docs should not need updates.

## Index

| Internal name       | CLI flag                                  | Programmatic option             | Value type                |
|---------------------|-------------------------------------------|---------------------------------|---------------------------|
| `cacheDb`           | `--experimental-cache-db [optional path]` | `experimentalCacheDb`           | `Partial<CacheDbOptions>` |
| `client`            | `--experimental-client`                   | `experimentalClient`            | `boolean`                 |
| `contextManagement` | `--experimental-context-management`       | `experimentalContextManagement` | `boolean`                 |

---

## cacheDb

Enables disk-backed persistent caching for remote network documentation requests using SQLite. Cold server starts hydrate from local storage to reduce outbound network requests and improve response times.

> **Requirement**: Persistent disk cache requires **Node.js version 24 or higher** (`node:sqlite`). Running on Node.js < 24 will fail startup with a version requirement error.

### Use cases

| Use case                                           | Configuration                                                      | Behavior                                                                                                                                                                                            |
|----------------------------------------------------|--------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **All-day desktop workflow** (screen locks)        | `--experimental-cache-db` (defaults to `:memory:`)                 | In-memory SQLite cache. Best for users who leave their IDE and MCP server process running throughout the workday. Screen locks and idle sessions preserve cache hits without writing files to disk. |
| **Cross-session persistence** (reboots & restarts) | `--experimental-cache-db <path>` (e.g. `~/.cache/patternfly-mcp/`) | File-backed SQLite cache (`pfmcp.db`). Best for users who routinely restart client tools, reboot their machines, or want warm caches across completely separate sessions.                           |
| **Container & CI environments**                    | `--experimental-cache-db /cache/` with volume mount                | Preserves cache database across container restarts and updates using a mounted volume (e.g., `-v pfmcp-cache:/cache:Z`).                                                                            |

### CLI

`--experimental-cache-db` accepts either a boolean flag (enabling in-memory storage) or an optional path pointing to a directory or a specific database file:

```bash
# 1. Boolean flag (in-memory cache, non-persistent across restarts)
npx -y @patternfly/patternfly-mcp@latest --experimental-cache-db

# 2. Path to directory (persistent cache, auto-creates pfmcp.db within directory)
npx -y @patternfly/patternfly-mcp@latest --experimental-cache-db ~/.cache/patternfly-mcp/

# 3. Path with database filename (persistent cache to an explicit file)
npx -y @patternfly/patternfly-mcp@latest --experimental-cache-db ~/.cache/patternfly-mcp/custom-cache.db
```

> **Note on `:memory:`**: If `--experimental-cache-db` is passed without a path argument, it defaults to `:memory:`. In-memory mode utilizes SQLite caching for the active session and will **not** persist cached data once the server process terminates. Specify a file or directory path for cross-session persistence.

### Programmatic

`experimentalCacheDb` accepts a `Partial<CacheDbOptions>` configuration object:

```typescript
import { start } from '@patternfly/patternfly-mcp';

// Enable with defaults (in-memory SQLite cache)
const server = await start({
  experimentalCacheDb: {
    enabled: true
  }
});

// Enable with custom persistent database path and options
const server = await start({
  experimentalCacheDb: {
    enabled: true,
    dbPath: '/Users/username/.cache/patternfly-mcp/pfmcp.db'
  }
});
```

#### CacheDbOptions

| Option              | Type      | Default      | Description                                                                                                                                                                                     |
|---------------------|-----------|--------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `enabled`           | `boolean` | `false`      | Enable persistent caching. Set to `true` when `--experimental-cache-db` is passed on the CLI or `experimentalCacheDb` is enabled programmatically.                                              |
| `dbPath`            | `string`  | `':memory:'` | Filesystem path to the database or `':memory:'`. When a directory path is provided (ending in `/` or resolving to an existing folder), the database file is resolved using `dbDefaultFilename`. |
| `dbDefaultFilename` | `string`  | `'pfmcp.db'` | The filename appended when `dbPath` resolves to a directory rather than a file.                                                                                                                 |
| `busyTimeoutMs`     | `number`  | `5000`       | Milliseconds to wait during SQLite lock contention before throwing an `SQLITE_BUSY` error.                                                                                                      |

### MCP Client Configuration

```json
{
  "mcpServers": {
    "patternfly-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@patternfly/patternfly-mcp@latest",
        "--experimental-cache-db",
        "/Users/username/.cache/patternfly-mcp/pfmcp.db"
      ]
    }
  }
}
```

---

## client

The interactive client launches an embedded terminal UI directly connected to the PatternFly MCP server over an in-process memory transport channel (`createMcpChannel`). It allows developers and contributors to interactively search, browse collections, inspect component schemas, view documentation, copy contents via system clipboard or OSC-52, and export local markdown files.

> **Requirement**: The interactive client requires an interactive terminal (TTY) with standard input and output attached (`stdin.isTTY` and `stdout.isTTY`). Running non-interactively or in automated headless pipelines will exit with an error.

### Controls

| Keystroke | Context | Action |
|-----------|---------|--------|
| `/` | Search Screen | Prompt for new search query |
| `<Tab>` | Search Screen | Cycle through registered collections filter |
| `<↑/↓>` | Search & Reader | Navigate tree items or scroll reader document |
| `<Enter>` | Search Screen | Select record to read or toggle collection expand/collapse |
| `<Enter>` / `b` / `<Esc>` | Reader Screen | Return to search results view |
| `c` | Reader Screen | Copy full document text to clipboard (`pbcopy`, `wl-copy`, `xclip`, or OSC-52) |
| `r` | Reader Screen | Save document to local disk as a `.md` file |
| `q` / `Ctrl+C` | Any Screen | Exit interactive client |

### CLI

Launch the interactive terminal client:

```bash
npx -y @patternfly/patternfly-mcp@latest --experimental-client
```

> **Note**: The interactive client communicates over an in-process/memory transport channel and cannot be combined with network transports like `--http`.

### Programmatic

```typescript
import { start } from '@patternfly/patternfly-mcp';

const server = await start({
  mode: 'cli',
  experimentalClient: true
});
```

---

## contextManagement

Context management (also called **token-saver mode**) switches the server from the default two-step search-and-fetch workflow to a resource-link workflow for MCP clients that read `patternfly://` URIs directly.

> `contextManagement` is part of a broader set of updates intended to optimize the PatternFly MCP server's use of MCP resources and streamline code. Additional refactors may be included under this umbrella under later releases.

| Mode                    | Registered tools                                      | Typical workflow                                                                 |
|-------------------------|-------------------------------------------------------|----------------------------------------------------------------------------------|
| **Default** _(off)_     | `searchPatternFlyDocs`, `usePatternFlyDocs`           | Search returns text with URLs, names, and URIs; fetch content with `usePatternFlyDocs`. |
| **Context management**  | `searchPatternFly` only                               | Search returns `resource_link` items; read content with `resources/read`.        |

Built-in MCP resources (`patternfly://docs/...`, `patternfly://schemas/...`, indexes, and `patternfly://context`) remain available in both modes.

> **Important!**
>
> In **default** mode, `searchPatternFlyDocs` returns and `usePatternFlyDocs` accepts `patternfly://` URIs. This is a compatibility bridge for limited MCP clients. This is a transitional allowance: context management is the architecture the PatternFly MCP tools are moving towards, where URIs are returned as links and read through MCP resources. However, this does not mean the older technique of returning Markdown will go away; there is still a possible future where the PatternFly MCP retains the older Markdown response techniques to purposefully support limited and agentless MCP clients.

### Tool: searchPatternFly

Registered only when context management is enabled.

Search PatternFly components, documentation, guidelines, and JSON schemas by keyword. Returns MCP `resource_link` content items (collections, docs, and schemas).

**Parameters:**
- `query`: `string` (required) — Case-insensitive query for full or partial keywords, resource names, versions and more (e.g., `"button"`, `"card v6"`, `"react"`, `"*"`)
- `collection`: `string` (optional) — Filter results by a primary collection of records (e.g., `"patternfly-docs"`, `"patternfly-component-schemas"`, `"patternfly-api"`). Note that additional specialized or experimental collections outside the primary core set may also be available or shift across releases.

**Examples:**

Search across all collections:
```json
{
  "query": "button"
}
```

Search filtered by collection:
```json
{
  "query": "button",
  "collection": "patternfly-docs"
}
```

### CLI

```bash
npx -y @patternfly/patternfly-mcp@latest --experimental-context-management
```

HTTP transport:

```bash
npx -y @patternfly/patternfly-mcp@latest --http --port 8080 --experimental-context-management
```

### Programmatic

```typescript
import { start } from '@patternfly/patternfly-mcp';

const server = await start({
  experimentalContextManagement: true
});
```

### MCP client configuration

Stdio:

```json
{
  "mcpServers": {
    "patternfly-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@patternfly/patternfly-mcp@latest",
        "--experimental-context-management"
      ],
      "description": "PatternFly rules and documentation (experimental context management)"
    }
  }
}
```

HTTP:

```json
{
  "mcpServers": {
    "patternfly-mcp": {
      "command": "npx",
      "args": [
        "-y",
        "@patternfly/patternfly-mcp@latest",
        "--http",
        "--port",
        "8080",
        "--experimental-context-management"
      ],
      "description": "PatternFly rules and documentation (HTTP, experimental context management)"
    }
  }
}
```
