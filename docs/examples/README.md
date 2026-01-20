# Code Examples

PatternFly MCP code examples for tooling plugins and development use cases.

- **[basicUsage.js](basicUsage.js)** - Basic server startup with stdio transport
- **[embeddedServer.ts](embeddedServer.ts)** - Embedding the server and using custom inline tools to make your own MCP server
- **[httpTransport.js](httpTransport.js)** - HTTP transport configuration and usage
- **[toolPluginHelloWorld.js](toolPluginHelloWorld.js)** - A basic JS tool plugin example
- **[toolPluginNpmScripts.js](toolPluginNpmScripts.js)** - Execute NPM scripts with validation and error handling
- **[toolPluginPatternFlyCli.js](toolPluginPatternFlyCli.js)** - Execute PatternFly CLI commands with validation and error handling
- **[toolPluginGitStatus.js](toolPluginGitStatus.js)** - Get Git repository status with formatted output
- **[toolPluginESLint.js](toolPluginESLint.js)** - Execute ESLint on files or directories with validation and error handling
- **[toolPluginFileSearch.js](toolPluginFileSearch.js)** - Search for files by name pattern or search for content within files using grep
- **[toolPluginNpmRegistry.js](toolPluginNpmRegistry.js)** - Query the NPM registry for package information including versions, dependencies, and metadata


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
