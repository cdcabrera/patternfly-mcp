# Code Examples

This directory contains standalone, copy-pasteable snippets for integrating and extending the PatternFly MCP Server.

## Examples Index

- **[Basic Usage](./basic-usage.ts)**: Start the server with default settings in your own Node.js app.
- **[HTTP Transport](./http-transport.ts)**: Configure and run the server using HTTP instead of stdio.
- **[Tool Plugins](./tool-plugins.ts)**: Authoring custom tools that can be loaded via the `--tool` flag.
- **[In-Process Embedding](./embedding.ts)**: Embedding the server and registering inline tools.

## Running Examples
Most examples are designed to be used as part of a larger application. You can run them using `tsx` or by compiling them with `tsc`:

```bash
npx tsx docs/examples/basic-usage.ts
```
