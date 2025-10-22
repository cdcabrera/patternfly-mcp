import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { OPTIONS } from './options';

type McpTool = [string, { description: string; inputSchema: any }, (args: any) => Promise<any>];

type McpToolCreator = () => McpTool;

/**
 * Server instance with shutdown capability
 */
interface ServerInstance {

  /**
   * Stop the server gracefully
   */
  stop(): Promise<void>;

  /**
   * Check if server is running
   */
  isRunning(): boolean;
}

/**
 * Create a server instance with shutdown capability
 */
class PatternFlyMcpServer implements ServerInstance {
  private server: McpServer | null = null;
  private transport: StdioServerTransport | null = null;
  private running = false;

  /**
   *
   * @param options
   * @param tools
   */
  constructor(
    private options = OPTIONS,
    private tools: McpToolCreator[] = [usePatternFlyDocsTool, fetchDocsTool]
  ) {}

  /**
   *
   */
  async start(): Promise<void> {
    try {
      this.server = new McpServer(
        {
          name: this.options.name,
          version: this.options.version
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      this.tools.forEach(toolCreator => {
        const [name, schema, callback] = toolCreator();

        console.info(`Registered tool: ${name}`);
        this.server!.registerTool(name, schema, callback);
      });

      this.transport = new StdioServerTransport();
      await this.server.connect(this.transport);

      this.running = true;
      console.log('PatternFly MCP server running on stdio');
    } catch (error) {
      console.error('Error creating MCP server:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.server && this.running) {
      await this.server.close();
      this.running = false;
      console.log('PatternFly MCP server stopped');
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

/**
 * Create, register tool and errors, then run the server.
 *
 * @param options
 * @param settings
 * @param settings.tools
 */
const runServer = async (options = OPTIONS, {
  tools = [
    usePatternFlyDocsTool,
    fetchDocsTool
  ]
}: { tools?: McpToolCreator[] } = {}): Promise<void> => {
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

    tools.forEach(toolCreator => {
      const [name, schema, callback] = toolCreator();

      console.info(`Registered tool: ${name}`);
      server.registerTool(name, schema, callback);
    });

    process.on('SIGINT', async () => {
      await server?.close();
      process.exit(0);
    });

    const transport = new StdioServerTransport();

    await server.connect(transport);
    console.log('PatternFly MCP server running on stdio');
  } catch (error) {
    console.error('Error creating MCP server:', error);
    throw error;
  }
};

/**
 * Create and start a server instance with shutdown capability
 *
 * @param options
 * @param root0
 * @param root0.tools
 */
const createServer = async (options = OPTIONS, {
  tools = [usePatternFlyDocsTool, fetchDocsTool]
}: { tools?: McpToolCreator[] } = {}): Promise<ServerInstance> => {
  const server = new PatternFlyMcpServer(options, tools);

  await server.start();

  return server;
};

export {
  runServer,
  createServer,
  PatternFlyMcpServer,
  type McpTool,
  type McpToolCreator,
  type ServerInstance
};
