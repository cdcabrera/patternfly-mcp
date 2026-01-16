# Code Examples

PatternFly MCP code examples for tooling plugins and development use cases.

- **[embeddedBasic.js](embeddedBasic.js)** - Embedding a basic server startup with stdio transport
- **[embeddedHttpTransport.js](embeddedHttpTransport.js)** - Embedding an HTTP transport configuration and usage
- **[embeddedInlineTools.ts](embeddedInlineTools.ts)** - Embedding the server and using custom inline tools to make your own MCP server
- **[toolPluginGitStatus.js](toolPluginGitStatus.js)** - A custom tool using Git
- **[toolPluginHelloWorld.js](toolPluginHelloWorld.js)** - A basic JS tool plugin example


## Adding new example guidance

Examples should follow the basic guidelines:

1. This index is updated with an example link
2. Filenames are lowerCamelCased
3. Keep examples short, this is an introduction to the project
4. Examples are either JS or TS with ESM import/exports
5. Comments/annotations are used to explain key concepts
6. Examples are linted from the projects linting configs with
   - `npm run test:lint`
   - `npm run test:types`
   - `npm run test:spell-docs`
7. Examples are confirmed to be tested and runnable
