# PatternFly MCP Tool Plugin Template

Template for creating PatternFly MCP (Model Context Protocol) tool plugins.

## 🚀 Quick Start

### 1. Copy this template

```bash
# Clone or copy this directory
cp -r examples/plugin-template my-plugin
cd my-plugin
```

### 2. Update package.json

```json
{
  "name": "@patternfly/mcp-tool-my-plugin",
  "version": "1.0.0",
  "description": "My awesome PatternFly MCP tool",
  "author": "Your Name"
}
```

### 3. Implement your tool

Edit `src/index.ts` and replace the template code with your tool logic:

```typescript
const myPlugin: PluginFactory = (context) => {
  return () => {
    const callback = async (args) => {
      // Your tool logic here
      return { content: [{ type: 'text', text: 'result' }] };
    };
    
    return ['myTool', { description: '...', inputSchema: {} }, callback];
  };
};
```

### 4. Test your plugin

```bash
npm install
npm test
```

### 5. Build and use

```bash
# Build
npm run build

# Test locally (link to main repo)
npm link
cd /path/to/patternfly-mcp
npm link @patternfly/mcp-tool-my-plugin

# Run server with your plugin
node dist/index.js --plugins "@patternfly/mcp-tool-my-plugin"
```

---

## 📁 Project Structure

```
plugin-template/
├── src/
│   ├── index.ts              # Main plugin code
│   └── __tests__/
│       └── index.test.ts     # Plugin tests
├── dist/                     # Build output (gitignored)
├── package.json              # Package configuration
├── tsconfig.json             # TypeScript configuration
├── jest.config.js            # Jest configuration
├── .gitignore                # Git ignore rules
└── README.md                 # This file
```

---

## 🔧 Development

### Install dependencies

```bash
npm install
```

### Build

```bash
# One-time build
npm run build

# Watch mode
npm run build:watch
```

### Test

```bash
# Run tests once
npm test

# Watch mode
npm run test:watch
```

### Lint

```bash
npm run lint
```

---

## 📚 Documentation

### Plugin Context API

Your plugin receives a `context` object with these utilities:

```typescript
context.utils = {
  memo,                    // Memoization utility
  fetchUrl,                // Fetch remote content (memoized)
  readFile,                // Read local files (memoized)
  resolveLocalPath         // Resolve file paths
}

context.config = {
  serverName,              // Server name
  serverVersion,           // Server version
  separator,               // Content separator
  pluginOptions            // Your plugin's options
}

context.logger = {
  info, warn, error, debug // Console logging
}

context.types = {
  McpError,                // MCP SDK error class
  ErrorCode                // MCP SDK error codes
}
```

### Input Schema (Zod)

Define your tool's inputs using Zod:

```typescript
import { z } from 'zod';

inputSchema: {
  query: z.string()
    .min(1)
    .describe('Search query'),
  
  limit: z.number()
    .int()
    .positive()
    .max(100)
    .default(10)
    .describe('Max results')
}
```

### Error Handling

Always use `McpError` for errors:

```typescript
throw new context.types.McpError(
  context.types.ErrorCode.InvalidParams,
  'query is required'
);
```

### Response Format

Return responses in MCP format:

```typescript
return {
  content: [{
    type: 'text',
    text: 'Your response text here'
  }]
};
```

---

## 📖 Full Guides

- **[Plugin Authoring Guide](../../.agent/plugins/04-authoring-guide.md)** - Complete step-by-step guide
- **[API Reference](../../.agent/plugins/05-api-reference.md)** - Detailed API documentation
- **[Main Repository](https://github.com/patternfly/patternfly-mcp)** - PatternFly MCP server

---

## 🚀 Publishing

### 1. Prepare for publishing

```bash
# Update version
npm version patch  # or minor/major

# Build and test
npm run build
npm test
```

### 2. Publish to npm

```bash
# Login to npm (if not already)
npm login

# Publish
npm publish --access public
```

### 3. Use your published plugin

```bash
# Install in PatternFly MCP server
npm install @patternfly/mcp-tool-my-plugin

# Run server with plugin
node dist/index.js --plugins "@patternfly/mcp-tool-my-plugin"
```

---

## 🎯 Best Practices

### 1. Single Responsibility

Each plugin should provide **one tool** that does **one thing well**.

### 2. Clear Descriptions

Write descriptions for AI assistants:

```typescript
{
  description: 'Search PatternFly components by name or keyword. ' +
               'Returns component details including props and examples.'
}
```

### 3. Validate Early

Validate inputs before expensive operations:

```typescript
if (!query?.trim()) {
  throw new context.types.McpError(
    context.types.ErrorCode.InvalidParams,
    'query cannot be empty'
  );
}
```

### 4. Use Memoization

Cache expensive operations:

```typescript
const fetchData = context.utils.memo(
  async (url) => fetch(url).then(r => r.text()),
  { cacheLimit: 50, expire: 5 * 60 * 1000 }
);
```

### 5. Handle Errors Gracefully

Provide helpful error messages:

```typescript
throw new context.types.McpError(
  context.types.ErrorCode.InternalError,
  `Failed to fetch from ${url}: ${error.message}`
);
```

---

## 📝 License

MIT - See LICENSE file for details.

---

## 🤝 Contributing

Contributions welcome! Please open an issue or PR.

---

## 💡 Examples

Looking for inspiration? Check out these example plugins:

- `@patternfly/mcp-tool-component-search` - Search PatternFly components
- `@patternfly/mcp-tool-design-tokens` - Look up design token values
- More coming soon!

---

**Happy plugin building!** 🎉

For questions or help, open an issue on the [PatternFly MCP repository](https://github.com/patternfly/patternfly-mcp).

