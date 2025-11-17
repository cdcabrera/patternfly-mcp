import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getOptions } from './options.context';
import { getProcessOnPort, formatPortConflictError, isSameMcpServer, killProcess } from './server.port.js';

/**
 * Create Streamable HTTP transport
 *
 * @param options - Global options (default parameter)
 */
const createStreamableHttpTransport = (options = getOptions()) => {
  const transportOptions: any = {
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: false, // Use SSE streaming
    enableDnsRebindingProtection: true,
    onsessioninitialized: (sessionId: string) => {
      console.log(`Session initialized: ${sessionId}`);
    },
    onsessionclosed: (sessionId: string) => {
      console.log(`Session closed: ${sessionId}`);
    }
  };

  // Only include optional properties if they have values
  if (options.allowedOrigins) {
    transportOptions.allowedOrigins = options.allowedOrigins;
  }
  if (options.allowedHosts) {
    transportOptions.allowedHosts = options.allowedHosts;
  }

  return new StreamableHTTPServerTransport(transportOptions);
};

/**
 * Handle Streamable HTTP requests
 *
 * @param req - HTTP request object
 * @param res - HTTP response object
 * @param transport - Streamable HTTP transport
 */
const handleStreamableHttpRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  transport: StreamableHTTPServerTransport
) => {
  await transport.handleRequest(req, res);
};

/**
 * Start HTTP transport server
 *
 * @param mcpServer - MCP server instance
 * @param options - Global options (default parameter)
 */
const startHttpTransport = async (mcpServer: McpServer, options = getOptions()): Promise<void> => {
  const { port, host } = options;

  if (!port || !host) {
    throw new Error('Port and host are required for HTTP transport');
  }

  const transport = createStreamableHttpTransport(options);

  // Connect MCP server to transport
  await mcpServer.connect(transport);

  // Set up
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handleStreamableHttpRequest(req, res, transport);
  });

  // Check for port conflicts and handle kill-existing BEFORE creating the Promise
  if (options.killExisting) {
    const processInfo = getProcessOnPort(port);

    if (processInfo) {
      if (isSameMcpServer(processInfo.command)) {
        killProcess(processInfo.pid);
      } else {
        throw new Error(`Port ${port} is in use by a different process`, { cause: processInfo });
      }
    }
  }

  // Start server (port should be free now, or we'll get an error)
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`MCP server running on http://${host}:${port}`);
      resolve();
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        const processInfo = getProcessOnPort(port);

        console.error(formatPortConflictError(port, processInfo));

        if (processInfo) {
          reject(new Error(`Port ${port} is already in use by PID ${processInfo.pid}`, { cause: processInfo }));
        } else {
          reject(error);
        }
      } else {
        console.error('HTTP server error:', error);
        reject(error);
      }
    });
  });
};

export {
  createStreamableHttpTransport,
  handleStreamableHttpRequest,
  startHttpTransport
};
