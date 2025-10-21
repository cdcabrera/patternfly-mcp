import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { fetchDocsTool } from './tool.fetchDocs';
import { componentSchemasTool } from './tool.componentSchemas';
import { startHttpTransport, type HttpServerHandle } from './server.http';
import { memo } from './server.caching';
import { getOptions, runWithOptions } from './options.context';
import { type GlobalOptions } from './options';
import { log } from './logger';
import { createServerLogger } from './server.logger';

type McpTool = [string, { description: string; inputSchema: any }, (args: any) => Promise<any>];

type McpToolCreator = (options?: GlobalOptions) => McpTool;

/**
 * Server options. Equivalent to GlobalOptions.
 */
type ServerOptions = GlobalOptions;

/**
 * Represents the configuration settings for a server.
 *
 * @interface ServerSettings
 *
 * @property {McpToolCreator[]} [tools] - An optional array of tool creators used by the server.
 * @property [enableSigint] - Indicates whether SIGINT signal handling is enabled.
 * @property [allowProcessExit] - Determines if the process is allowed to exit explicitly.
 */
interface ServerSettings {
  tools?: McpToolCreator[];
  enableSigint?: boolean;
  allowProcessExit?: boolean;
}

/**
 * Server instance with shutdown capability
 *
 * @property stop - Stops the server, gracefully.
 * @property isRunning - Indicates whether the server is running.
 */
interface ServerInstance {
  stop(): Promise<void>;
  isRunning(): boolean;
}

/**
 * Create and run a server with shutdown, register tool and errors.
 *
 * @param [options] Server options
 * @param [settings] Server settings (tools, signal handling, etc.)
 * @param [settings.tools]
 * @param [settings.enableSigint]
 * @param [settings.allowProcessExit]
 * @returns Server instance
 */
const runServer = async (options: ServerOptions = getOptions(), {
  tools = [
    usePatternFlyDocsTool,
    fetchDocsTool,
    componentSchemasTool
  ],
  enableSigint = true,
  allowProcessExit = true
}: ServerSettings = {}): Promise<ServerInstance> => {
  let server: McpServer | null = null;
  let transport: StdioServerTransport | null = null;
  let httpHandle: HttpServerHandle | null = null;
  let unsubscribeServerLogger: (() => void) | null = null;
  let running = false;
  // let stopServerCalled = false;

  const stopServer = async () => {
    log.info(`\n${options.name} server shutting down... `);
    // if (stopServerCalled) {
    //  return;
    // }

    // stopServerCalled = true;

    // Easily missed, but writing a console.log or stdout entry helps interrupt the process
    // process.stdout.write(`\n${options.name} server shutting down... ${allowProcessExit}`);
    // process.stdout.write('\n');

    if (server && running) {
      log.info(`${options.name} shutting down...`);

      if (httpHandle) {
        log.info('...closing HTTP transport');
        await httpHandle.close();
        httpHandle = null;
      }

      log.info('...closing Server');
      await server?.close();
      running = false;
      log.info(`${options.name} closed!\n`);
      unsubscribeServerLogger?.();

      if (allowProcessExit) {
        process.exit(0);
      }
    }

    /*
    if (server && running) {
      console.log(`${options.name} shutting down...`);
      console.log('...closing Server');

      await Promise.resolve(server?.close())
        .catch(error => console.error(`Error closing ${options.name} server: ${error}`));

      running = false;

      if (httpHandle) {
        console.log('...closing HTTP transport');
        Promise.resolve(httpHandle.close())
          .catch(error => console.error(`Error closing ${options.name} HTTP transport: ${error}`));

        httpHandle = null;
      }

      console.log(`${options.name} closed!\n`);

      if (allowProcessExit) {
        process.exit(0);
      }
    }
    */

    /*
    if (server && running) {
      if (httpHandle) {
        console.log('...closing HTTP transport');
        // await httpHandle.close();
        await Promise.resolve(httpHandle.close())
          .catch(error => console.error(`Error closing ${options.name} HTTP transport: ${error}`));

        httpHandle = null;
      }

      console.log('...closing Server');

      await Promise.resolve(server?.close())
        .catch(error => console.error(`Error closing ${options.name} server: ${error}`));

      console.log(`${options.name} closed!\n`);
      running = false;
      if (allowProcessExit) {
        process.exit(0);
      }

      /*
      await server?.close();
      running = false;
      // process.stdout.write('Server stopped!\n');
      console.log(`${options.name} closed!\n`);

      if (allowProcessExit) {
        // setTimeout(() => process.exit(0), 100);
        process.exit(0);
      }
       * /
    }*/
  };

  try {
    const enableProtocolLogging = options?.logging?.protocol;

    server = new McpServer(
      {
        name: options.name,
        version: options.version
      },
      {
        capabilities: {
          tools: {},
          ...(enableProtocolLogging ? { logging: {} } : {})
        }
      }
    );

    unsubscribeServerLogger = createServerLogger.memo(server);

    tools.forEach(toolCreator => {
      const [name, schema, callback] = toolCreator(options);

      log.info(`Registered tool: ${name}`);
      server?.registerTool(name, schema, (args = {}) => runWithOptions(options, async () => await callback(args)));
    });

    if (enableSigint) {
      process.on('SIGINT', async () => stopServer());
    }

    if (options.http) {
      httpHandle = await startHttpTransport(server, options);
      // HTTP transport logs its own message
    } else {
      transport = new StdioServerTransport();

      await server.connect(transport);
      // STDIO log
      log.info(`${options.name} server running on stdio`);
    }

    running = true;
  } catch (error) {
    log.error(`Error creating ${options.name} server:`, error);
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

/**
 * Memoized version of runServer.
 * - Automatically cleans up servers when cache entries are rolled off (cache limit reached)
 * - Prevents port conflicts by returning the same server instance via memoization
 * - `onCacheRollout` closes servers that were rolled out of caching due to cache limit
 */
runServer.memo = memo(
  runServer,
  {
    cacheLimit: 10,
    debug: info => {
      log.info(`Server memo: ${JSON.stringify(info, null, 2) || 'No info available'}`);
    },
    onCacheRollout: async ({ removed }) => {
      const results: PromiseSettledResult<ServerInstance>[] = await Promise.allSettled(removed);

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const server = result.value;

          if (server?.isRunning?.()) {
            try {
              await server.stop();
            } catch (error) {
              console.error(`Error stopping server: ${error}`);
            }
          }
        } else {
          console.error(`Error cleaning up server: ${result?.reason?.message || result?.reason || 'Unknown error'}`);
        }
      }
    }
  }
);

export {
  runServer,
  type McpTool,
  type McpToolCreator,
  type ServerInstance,
  type ServerOptions,
  type ServerSettings
};
