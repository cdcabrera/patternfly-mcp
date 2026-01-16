# Code Examples

This directory contains TypeScript code examples for common use cases with the PatternFly MCP Server.

## Examples Index

- **[basic-usage.ts](basic-usage.ts)** - Basic server startup with stdio transport
- **[tool-plugins.ts](tool-plugins.ts)** - Creating and using tool plugins
- **[http-transport.ts](http-transport.ts)** - HTTP transport configuration and usage
- **[embedding.ts](embedding.ts)** - Embedding the server in your application

## Running Examples

These examples are TypeScript files that can be run directly with `tsx` or compiled and run with Node.js:

```bash
# Run with tsx
npx tsx docs/examples/basic-usage.ts

# Or compile first
npm run build
node dist/examples/basic-usage.js
```

## Example Categories

### Basic Usage
- Starting the server
- stdio transport
- Basic configuration

### Tool Plugins
- Creating custom tools
- Using `createMcpTool` helper
- Tool plugin examples

### HTTP Transport
- HTTP server configuration
- Security settings
- CORS and host validation

### Embedding
- Programmatic API usage
- Embedding in applications
- Custom tool modules

## Contributing Examples

When adding new examples:
1. Follow the existing code style
2. Include comments explaining key concepts
3. Add the example to this README index
4. Ensure the example is runnable and tested
