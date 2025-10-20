# PatternFly MCP Server

A Model Context Protocol (MCP) server that provides access to PatternFly React development rules and documentation, built with Node.js and TypeScript.

## What is MCP?

The Model Context Protocol (MCP) is an open standard that enables AI assistants to securely access external data sources and tools. This server exposes PatternFly documentation and development rules through a standard MCP stdio transport, so any MCP‑compatible client can call its tools.

## Features

- TypeScript implementation with ES modules
- PatternFly documentation access (design guidelines, accessibility, charts, and local docs)
- Two built-in tools for fetching index content and specific pages
- **Plugin system** for extending functionality with custom tools
- Simple memoization for fast repeat fetches
- Robust error handling with MCP error codes
- Works over stdio; easy to run from MCP clients

## Prerequisites

- Node.js 18.0.0 or higher
- npm (or another Node package manager)

## Installation

### Local development

1) Install dependencies:

```bash
npm install
```

2) Build the project:

```bash
npm run build
```

3) Run in watch/dev mode (TypeScript via tsx):

```bash
npm run start:dev
```

### Use via npx (after publishing)

```bash
npx @jephilli-patternfly-docs/mcp
```

Or install locally in a project and run:

```bash
npm install @jephilli-patternfly-docs/mcp
npx @jephilli-patternfly-docs/mcp
```

## Scripts

These are the most relevant NPM scripts from package.json:

- `build`: Build the TypeScript project (cleans dist, type-checks, bundles)
- `build:clean`: Remove dist
- `build:watch`: Build in watch mode
- `start`: Run the built server (node dist/index.js)
- `start:dev`: Run with tsx in watch mode (development)
- `test`: Run linting, type-check, and unit tests in src/
- `test:dev`: Jest watch mode for unit tests
- `test:integration`: Build and run integration tests in tests/
- `test:integration-dev`: Watch mode for integration tests
- `test:lint`: Run ESLint (code quality checks)
- `test:lint-fix`: Run ESLint with auto-fix
- `test:types`: TypeScript type-check only (no emit)

## Usage

The MCP server communicates over stdio and provides access to PatternFly documentation through the following tools. Both tools accept an argument named urlList which must be an array of strings. Each string is either:
- An external URL (e.g., a raw GitHub URL to a .md file), or
- A local file path (e.g., documentation/.../README.md). When running with the --docs-host flag, these paths are resolved under the llms-files directory instead.

Returned content format:
- For each entry in urlList, the server loads its content, prefixes it with a header like: `# Documentation from <resolved-path-or-url>` and joins multiple entries using a separator: `\n\n---\n\n`.
- If an entry fails to load, an inline error message is included for that entry.

### Tool: usePatternFlyDocs

Use this to fetch high-level index content (for example, a local README.md that contains relevant links, or llms.txt files in docs-host mode). From that content, you can select specific URLs to pass to fetchDocs.

Parameters:
- `urlList`: string[] (required)

Response (tools/call):
- content[0].type = "text"
- content[0].text = concatenated documentation content (one or more sources)

### Tool: fetchDocs

Use this to fetch one or more specific documentation pages (e.g., concrete design guidelines or accessibility pages) after you’ve identified them via usePatternFlyDocs.

Parameters:
- `urlList`: string[] (required)

Response (tools/call):
- content[0].type = "text"
- content[0].text = concatenated documentation content (one or more sources)

## 🔌 Plugins

PatternFly MCP Server supports plugins for extending functionality with custom tools. Plugins can be loaded from npm packages or local files.

### Using Plugins

#### Via CLI (Multiple Flags)

Load multiple plugins using the `--plugins` flag:

```bash
npx @jephilli-patternfly-docs/mcp \
  --plugins "@patternfly/mcp-tool-component-search" \
  --plugins "@patternfly/mcp-tool-design-tokens"
```

Or with local files:

```bash
npx @jephilli-patternfly-docs/mcp \
  --plugins "./my-custom-plugin.js" \
  --plugins "@patternfly/mcp-tool-component-search"
```

#### Via CLI (Comma-Separated)

You can also use comma-separated values:

```bash
npx @jephilli-patternfly-docs/mcp \
  --plugins "@patternfly/mcp-tool-search,@patternfly/mcp-tool-tokens"
```

#### Via Config File

For more complex configurations, use a server config file:

```bash
npx @jephilli-patternfly-docs/mcp --config server-config.json
```

Example `server-config.json`:

```json
{
  "server": {
    "name": "patternfly-mcp-server",
    "version": "1.1.0"
  },
  "plugins": [
    {
      "package": "@patternfly/mcp-tool-component-search",
      "enabled": true,
      "options": {
        "cacheLimit": 50,
        "includeDeprecated": false
      }
    },
    {
      "package": "./plugins/my-custom-plugin.js",
      "enabled": true,
      "options": {
        "apiEndpoint": "https://api.example.com"
      }
    }
  ]
}
```

See [`server-config-example.json`](./server-config-example.json) for a complete example.

### Creating Plugins

#### Quick Start

Use the plugin template to get started:

```bash
# Copy the template
cp -r examples/plugin-template my-plugin
cd my-plugin

# Install dependencies
npm install

# Implement your tool
# Edit src/index.ts
```

#### Plugin Structure

All plugins follow a factory pattern:

```typescript
import type { PluginFactory } from '@jephilli-patternfly-docs/mcp/types';

const myPlugin: PluginFactory = (context) => {
  // Plugin initialization (runs once on load)
  const { utils, config, logger, types } = context;
  
  return () => {
    // Tool registration (returns tuple)
    const callback = async (args) => {
      // Your tool logic here
      return {
        content: [{
          type: 'text',
          text: 'Result'
        }]
      };
    };
    
    return [
      'myTool',
      {
        description: 'My custom tool',
        inputSchema: { /* Zod schema */ }
      },
      callback
    ];
  };
};

export default myPlugin;
```

#### Documentation

- **[Plugin Authoring Guide](./.agent/plugins/04-authoring-guide.md)** - Complete step-by-step guide
- **[API Reference](./.agent/plugins/05-api-reference.md)** - Detailed API documentation
- **[Plugin Template](./examples/plugin-template/)** - Copy-paste starting point

### Official Plugins (Planned)

We plan to publish official plugins for common use cases:

- `@patternfly/mcp-tool-component-search` - Search PatternFly components by keyword
- `@patternfly/mcp-tool-design-tokens` - Look up design token values and usage
- `@patternfly/mcp-tool-accessibility-checker` - Check for common accessibility patterns
- More coming soon!

### Plugin Development

#### Local Development

```bash
# In your plugin directory
npm link

# In the patternfly-mcp directory
npm link your-plugin-name

# Run server with your plugin
npm run build
node dist/index.js --plugins "your-plugin-name" --verbose
```

#### Testing

```bash
# Run tests
npm test

# Watch mode
npm run test:watch
```

#### Publishing

```bash
# Build and test
npm run build
npm test

# Publish to npm
npm publish --access public
```

### Plugin API

Plugins receive a sandboxed context with safe, stable utilities:

#### context.utils

- `memo(func, options)` - Memoization utility for caching
- `fetchUrl(url)` - Fetch remote content (pre-memoized)
- `readFile(path)` - Read local files (pre-memoized)
- `resolveLocalPath(path)` - Resolve file paths

#### context.config

- `serverName` - Server name
- `serverVersion` - Server version
- `separator` - Content separator
- `pluginOptions` - Plugin-specific options from config file

#### context.logger

- `info()`, `warn()`, `error()`, `debug()` - Console logging

#### context.types

- `McpError` - MCP SDK error class
- `ErrorCode` - MCP SDK error codes enum

See the [API Reference](./.agent/plugins/05-api-reference.md) for complete details.

## Docs-host mode (local llms.txt mode)

If you run the server with --docs-host, local paths you pass in urlList are resolved relative to the llms-files folder at the repository root. This is useful when you have pre-curated llms.txt files locally.

Example:

```bash
npx @jephilli-patternfly-docs/mcp --docs-host
```

Then, passing a local path such as react-core/6.0.0/llms.txt in urlList will load from llms-files/react-core/6.0.0/llms.txt.

## MCP client configuration examples

Most MCP clients use a JSON configuration that tells the client how to start this server. The server itself does not read that JSON; it only reads CLI flags and environment variables. Below are examples you can adapt to your MPC client.

### Minimal client config (npx)

```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "npx",
      "args": ["-y", "@jephilli-patternfly-docs/mcp@latest"],
      "description": "PatternFly React development rules and documentation"
    }
  }
}
```

### Docs-host mode

```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "npx",
      "args": ["-y", "@jephilli-patternfly-docs/mcp@latest", "--docs-host"],
      "description": "PatternFly docs (docs-host mode)"
    }
  }
}
```

### Local development (after build)

```json
{
  "mcpServers": {
    "patternfly-docs": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/patternfly-mcp",
      "description": "PatternFly docs (local build)"
    }
  }
}
```

## Inspector-CLI examples (tools/call)

Note: The parameter name is urlList and it must be a JSON array of strings.

usePatternFlyDocs (example with a local README):

```bash
npx @modelcontextprotocol/inspector-cli \
  --config ./mcp-config.json \
  --server patternfly-docs \
  --cli \
  --method tools/call \
  --tool-name usePatternFlyDocs \
  --tool-arg urlList='["documentation/guidelines/README.md"]'
```

fetchDocs (example with external URLs):

```bash
npx @modelcontextprotocol/inspector-cli \
  --config ./mcp-config.json \
  --server patternfly-docs \
  --cli \
  --method tools/call \
  --tool-name fetchDocs \
  --tool-arg urlList='[
    "https://raw.githubusercontent.com/patternfly/patternfly-org/refs/heads/main/packages/documentation-site/patternfly-docs/content/design-guidelines/components/about-modal/about-modal.md",
    "https://raw.githubusercontent.com/patternfly/patternfly-org/refs/heads/main/packages/documentation-site/patternfly-docs/content/accessibility/components/about-modal/about-modal.md"
  ]'
```

## Environment variables

- DOC_MCP_FETCH_TIMEOUT_MS: Milliseconds to wait before aborting an HTTP fetch (default: 15000)
- DOC_MCP_CLEAR_COOLDOWN_MS: Default cooldown value used in internal cache configuration. The current public API does not expose a clearCache tool.

## Programmatic usage (advanced)

The server factory is exported. While there’s no explicit exports map, advanced users can import the built server module directly.

Example (ESM):

```js
// Not officially supported API surface; paths may change in future versions
import { runServer } from '@jephilli-patternfly-docs/mcp/dist/server.js';

await runServer();
```

## Returned content details

For each provided path or URL, the server returns a section:
- Header: `# Documentation from <resolved-path-or-url>`
- Body: the raw file content fetched from disk or network
- Sections are concatenated with `\n\n---\n\n`

This makes it easier to see where each chunk of content came from when multiple inputs are provided.

## Publishing

To make this package available via npx, you need to publish it to npm:

1. Ensure you have an npm account and are logged in:
```bash
npm login
```

2. Update the version in package.json if needed:
```bash
npm version patch  # or minor/major
```

3. Publish to npm:
```bash
npm publish
```

After publishing, users can run your MCP server with:
```bash
npx @jephilli-patternfly-docs/mcp
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Resources

- [Model Context Protocol Documentation](https://modelcontextprotocol.io/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [Node.js Documentation](https://nodejs.org/en/docs/)
- [TypeScript Documentation](https://www.typescriptlang.org/docs/) 
