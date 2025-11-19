import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { componentSchemasTool } from './tool.componentSchemas';
import { getOptions, runWithOptions } from './options.context';
import { type GlobalOptions } from './options';
import { startHttpTransport, type HttpServerHandle } from './server.http';

type McpTool = [string, { description: string; inputSchema: any }, (args: any) => Promise<any>];

type McpToolCreator = (options?: GlobalOptions) => McpTool;

/**
 * Server instance with shutdown capability
 */
interface ServerInstance {

  /**
   * Stop the server gracefully
   */
  stop(): Promise<void>;

  /**
   * Is the server running?
   */
  isRunning(): boolean;
}

/**
 * Create and run a server with shutdown, register tool and errors.
 *
 * @param options
 * @param settings
 * @param settings.tools
 * @param settings.enableSigint
 * @param settings.allowProcessExit
 */
const runServer = async (options = getOptions(), {
  tools = [
    usePatternFlyDocsTool,
    fetchDocsTool,
    componentSchemasTool
  ],
  enableSigint = true,
  allowProcessExit = true
}: { tools?: McpToolCreator[]; enableSigint?: boolean, allowProcessExit?: boolean } = {}): Promise<ServerInstance> => {
  let server: McpServer | null = null;
  let transport: StdioServerTransport | null = null;
  let httpHandle: HttpServerHandle | null = null;
  let running = false;
  // Store the signal handler so we can remove it on cleanup
  let sigintHandler: (() => Promise<void>) | null = null;

  const stopServer = async () => {
    if (server && running) {
      // Remove SIGINT handler to prevent it from keeping the process alive
      if (sigintHandler) {
        process.removeListener('SIGINT', sigintHandler);
        sigintHandler = null;
      }
      
      // For HTTP transport, close MCP server first to close transport sessions
      // Then close HTTP server to close the HTTP connections
      if (options.http && server) {
        await server.close();
        server = null;
      }
      
      if (httpHandle) {
        await httpHandle.close();
        httpHandle = null;
      }

      // For non-HTTP transport, close MCP server after transport cleanup
      if (!options.http && server) {
        await server.close();
        server = null;
      }
      
      running = false;
      console.log(`${options.name} server stopped`);

      if (allowProcessExit) {
        process.exit(0);
      }
    }
  };

  try {
    server = new McpServer(
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

    tools.forEach(toolCreator => {
      const [name, schema, callback] = toolCreator(options);

      console.info(`Registered tool: ${name}`);
      server?.registerTool(name, schema, (args = {}) => runWithOptions(options, async () => await callback(args)));
    });
    
    if (enableSigint) {
      sigintHandler = async () => stopServer();
      process.on('SIGINT', sigintHandler);
    }

    if (options.http) {
      httpHandle = await startHttpTransport(server, options);
      // HTTP transport logs its own message
    } else {
      transport = new StdioServerTransport();

      await server.connect(transport);
      // STDIO log
      console.log(`${options.name} server running on stdio`);
    }

    running = true;
  } catch (error) {
    console.error(`Error creating ${options.name} server:`, error);
    throw error;
  }

  return {
    async stop(): Promise<void> {
      return await stopServer();
    },

    isRunning(): boolean {
      return running;
    }
  };
};

export {
  runServer,
  type McpTool,
  type McpToolCreator,
  type ServerInstance
};
