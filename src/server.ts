import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { ZodRawShape } from 'zod';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { OPTIONS } from './options';
import type { ToolCallback } from './types';
import { loadPlugin } from './plugin-loader';
import { buildPluginContext } from './plugin-context';

/**
 * MCP tool definition tuple
 *
 * Format: [name, schema, callback]
 * - name: Tool identifier (string)
 * - schema: Tool description and Zod input schema
 * - callback: Async function handling tool execution
 */
type McpTool = [
  string,
  {
    description: string;
    inputSchema: ZodRawShape;
  },
  ToolCallback
];

/**
 * Tool creator function
 *
 * Returns a tuple defining an MCP tool
 */
type McpToolCreator = () => McpTool;

/**
 * Create, register tool and errors, then run the server.
 *
 * @param options
 * @param settings
 * @param settings.tools
 * @param settings.serverConfig
 */
const runServer = async (options = OPTIONS, {
  tools = [
    usePatternFlyDocsTool,
    fetchDocsTool
  ],
  serverConfig = {}
}: { tools?: McpToolCreator[]; serverConfig?: Record<string, unknown> } = {}): Promise<void> => {
  try {
    const server = new McpServer(
      {
        name: options.name,
        version: options.version
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    // Register core tools
    tools.forEach(toolCreator => {
      const [name, schema, callback] = toolCreator();

      console.info(`Registered tool: ${name}`);
      server.registerTool(name, schema, callback);
    });

    // Load and register plugins
    const pluginsToLoad = options.validatedPlugins || [];

    if (pluginsToLoad.length > 0) {
      console.info(`Loading ${pluginsToLoad.length} plugin(s)...`);

      // Build plugin context
      const pluginContext = buildPluginContext(serverConfig, options);

      // Load each plugin
      for (const pluginPath of pluginsToLoad) {
        const toolCreator = await loadPlugin(
          pluginPath,
          pluginContext,
          options.verbose ? { verbose: true } : {}
        );

        if (toolCreator) {
          // Register plugin tool
          const [name, schema, callback] = toolCreator();

          console.info(`Registered plugin tool: ${name}`);
          server.registerTool(name, schema, callback);
        }
        // If null, error already logged by loadPlugin
      }
    }

    process.on('SIGINT', async () => {
      await server?.close();
      process.exit(0);
    });

    const transport = new StdioServerTransport();

    await server.connect(transport);
    console.log('Patternfly MCP server running on stdio');
  } catch (error) {
    console.error('Error creating MCP server:', error);
    throw error;
  }
};

export {
  runServer,
  type McpTool,
  type McpToolCreator
};
