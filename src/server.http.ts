import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getOptions } from './options.context';
import { getProcessOnPort, formatPortConflictError, isSameMcpServer, killProcess } from './utils/port-check.js';

/**
 * Create Streamable HTTP transport
 *
 * @param options - Global options (default parameter)
 */
const createStreamableHttpTransport = (options = getOptions()): StreamableHTTPServerTransport => {
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
): Promise<void> => {
  // Single endpoint handles all operations
  await transport.handleRequest(req, res);
};

/**
 * Start HTTP transport server
 *
 * @param mcpServer - MCP server instance
 * @param options - Global options (default parameter)
 */
const startHttpTransport = async (mcpServer: McpServer, options = getOptions()): Promise<void> => {
  const transport = createStreamableHttpTransport(options);

  // Connect MCP server to transport
  await mcpServer.connect(transport);

  // Set up request handler
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    handleStreamableHttpRequest(req, res, transport);
  });

  // Start server
  return new Promise((resolve, reject) => {
    const port = options.port || 3000;
    const host = options.host || 'localhost';
    
    // Check for port conflicts before attempting to listen
    const processInfo = getProcessOnPort(port);
    if (processInfo) {
      const isSameProcess = isSameMcpServer(processInfo.command);
      
      if (options.killExisting && isSameProcess) {
        // User explicitly requested to kill existing instance
        console.log(`\n⚠️  Port ${port} is in use by another PatternFly MCP server instance (PID: ${processInfo.pid})`);
        console.log(`   Killing existing instance as requested...`);
        
        if (killProcess(processInfo.pid)) {
          console.log(`   ✅ Successfully killed process ${processInfo.pid}`);
          // Wait a moment for port to be released
          setTimeout(() => {
            startListening();
          }, 500);
          return;
        } else {
          console.error(`   ❌ Failed to kill process ${processInfo.pid}`);
          reject(new Error(`Failed to kill existing process on port ${port}`));
          return;
        }
      } else if (options.killExisting && !isSameProcess) {
        // User requested kill but it's not the same process - don't kill it!
        console.error(`\n❌ Port ${port} is in use by a different process (PID: ${processInfo.pid})`);
        console.error(`   Command: ${processInfo.command}`);
        console.error(`   --kill-existing flag only works for PatternFly MCP server instances.`);
        console.error(`   Please stop the process manually or use a different port.\n`);
        reject(new Error(`Port ${port} is in use by a different process`));
        return;
      }
    }
    
    // Start listening (either port is free, or we killed the existing process)
    startListening();
    
    function startListening() {
      server.listen(port, host, () => {
        console.log(`PatternFly MCP server running on http://${host}:${port}`);
        resolve();
      });
      
      server.on('error', (error: NodeJS.ErrnoException) => {
        // Handle port conflict with helpful error message
        if (error.code === 'EADDRINUSE') {
          const processInfo = getProcessOnPort(port);
          
          if (processInfo) {
            const errorMessage = formatPortConflictError(port, processInfo);
            console.error(errorMessage);
            reject(new Error(`Port ${port} is already in use by PID ${processInfo.pid}`));
          } else {
            console.error(`\n❌ Port ${port} is already in use.\n`);
            console.error(`   Unable to determine which process is using the port.\n`);
            console.error(`   Try using a different port: --port <different-port>\n`);
            reject(error);
          }
        } else {
          // Log other errors for debugging
          console.error('HTTP server error:', error);
          reject(error);
        }
      });
    }
  });
};

export {
  createStreamableHttpTransport,
  handleStreamableHttpRequest,
  startHttpTransport
};
