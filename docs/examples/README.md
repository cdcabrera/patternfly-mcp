# Code Examples

PatternFly MCP code examples for tooling plugins and development use cases.

- **[basicUsage.js](basicUsage.js)** - Basic server startup with stdio transport
- **[embeddedServer.ts](embeddedServer.ts)** - Embedding the server and using custom inline tools to make your own MCP server
- **[httpTransport.js](httpTransport.js)** - HTTP transport configuration and usage
- **[toolPluginHelloWorld.js](toolPlugins.js)** - A basic JS tool plugin example


## Adding new example guidance

Examples should follow the basic guidelines:

1. This index is updated with an example link
2. Filenames are lowerCamelCased
3. Examples are either JS or TS with ESM import/exports
4. Comments/annotations are used to explain key concepts
5. Examples are linted from the projects linting configs with
   - `npm run test:lint`
   - `npm run test:types`
   - `npm run test:spell-docs`
5. Examples are confirmed to be tested and runnable
