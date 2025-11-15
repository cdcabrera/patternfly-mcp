import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getOptions } from './options.context';

/**
 * PatternFly context resource
 * 
 * Provides information about PatternFly design system that models can discover
 * and read via the MCP resources API. This ensures all clients have access to
 * consistent PatternFly context without manual configuration.
 */
const PATTERNFLY_CONTEXT = `PatternFly is an open-source design system for building consistent, accessible user interfaces.

**What is PatternFly?**
PatternFly provides React components, design guidelines, and development tools for creating enterprise applications. It is used by Red Hat and other organizations to build consistent UIs with reusable components.

**Key Features:**
- React component library with TypeScript support
- Design guidelines and accessibility standards
- JSON Schema validation for component props
- Comprehensive documentation and examples

**PatternFly MCP Server:**
This MCP server provides tools and resources to access PatternFly documentation, component schemas, and design guidelines.

**Available Tools** (call via MCP tools/call):
- searchPatternFlyDocs: Search for component documentation URLs by name (returns URLs only)
- usePatternFlyDocs: Fetch documentation content from URLs (requires urlList parameter)
- componentSchemas: Get JSON Schema for PatternFly React components (requires componentName parameter)

**Available Resources** (read via MCP resources/read):
- patternfly://context: This resource - information about PatternFly and this MCP server

**Important**: All tools are MCP tools that must be called via JSON-RPC protocol, not code functions or UI workflows. Use the MCP protocol's tools/call method with the correct parameters for each tool. The JSON-RPC format is the same for both stdio (default) and HTTP transport - only the message transport layer differs.`;

/**
 * Register PatternFly context resource
 * 
 * @param server - MCP server instance
 * @param options - Global options (default parameter)
 */
export function registerPatternFlyContextResource(
  server: McpServer,
  options = getOptions()
): void {
  server.registerResource(
    'patternfly-context',
    'patternfly://context',
    {
      title: 'PatternFly Design System Context',
      description: 'Information about PatternFly design system and how to use this MCP server',
      mimeType: 'text/markdown'
    },
    async () => ({
      contents: [
        {
          uri: 'patternfly://context',
          mimeType: 'text/markdown',
          text: PATTERNFLY_CONTEXT
        }
      ]
    })
  );
}

