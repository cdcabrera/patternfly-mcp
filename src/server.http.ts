import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { OPTIONS } from './options';

/**
 * HTTP transport state
 */
interface HttpTransportState {
  server: any;
  mcpServer: McpServer;
  sessions: Map<string, SSEServerTransport>;
}

/**
 * Create HTTP transport state
 *
 * @param mcpServer - MCP server instance
 */
const createHttpTransportState = (mcpServer: McpServer): HttpTransportState => ({
  server: createServer(),
  mcpServer,
  sessions: new Map()
});

/**
 * Handle CORS headers for HTTP responses
 *
 * @param res - HTTP response object
 * @param options - Global options (default parameter)
 */
const handleCorsHeaders = (res: ServerResponse, options = OPTIONS): void => {
  if (options.cors !== false) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
};

/**
 * Handle preflight OPTIONS requests
 *
 * @param res - HTTP response object
 * @param options - Global options (default parameter)
 */
const handlePreflightRequest = (res: ServerResponse, options = OPTIONS): void => {
  handleCorsHeaders(res, options);
  res.writeHead(200);
  res.end();
};

/**
 * Handle SSE connection requests
 *
 * @param req - HTTP request object
 * @param res - HTTP response object
 * @param state - Transport state
 * @param options - Global options (default parameter)
 */
const handleSSEConnection = async (
  req: IncomingMessage,
  res: ServerResponse,
  state: HttpTransportState,
  options = OPTIONS
): Promise<void> => {
  const sseOptions: any = {
    enableDnsRebindingProtection: true
  };

  if (options.allowedOrigins) {
    sseOptions.allowedOrigins = options.allowedOrigins;
  }

  if (options.allowedHosts) {
    sseOptions.allowedHosts = options.allowedHosts;
  }

  const transport = new SSEServerTransport('/message', res, sseOptions);

  // Store session
  state.sessions.set(transport.sessionId, transport);

  // Connect MCP server to this transport
  await state.mcpServer.connect(transport);

  // Start SSE stream
  await transport.start();
};

/**
 * Handle message POST requests
 *
 * @param req - HTTP request object
 * @param res - HTTP response object
 * @param sessionId - Session ID from URL
 * @param state - Transport state
 */
const handleMessagePost = async (
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  state: HttpTransportState
): Promise<void> => {
  const transport = state.sessions.get(sessionId);

  if (!transport) {
    res.writeHead(404);
    res.end('Session not found');

    return;
  }

  // Parse request body
  let body = '';

  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const parsedBody = JSON.parse(body);

      await transport.handlePostMessage(req, res, parsedBody);
    } catch {
      res.writeHead(400);
      res.end('Invalid JSON');
    }
  });
};

/**
 * Handle HTTP requests
 *
 * @param req - HTTP request object
 * @param res - HTTP response object
 * @param state - Transport state
 * @param options - Global options (default parameter)
 */
const handleHttpRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  state: HttpTransportState,
  options = OPTIONS
): Promise<void> => {
  // Handle CORS
  handleCorsHeaders(res, options);

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    handlePreflightRequest(res, options);

    return;
  }

  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `http://${host}`);

  if (req.method === 'GET' && url.pathname === '/sse') {
    // SSE connection request
    await handleSSEConnection(req, res, state, options);
  } else if (req.method === 'POST' && url.pathname.startsWith('/message/')) {
    // Message POST request
    const sessionId = url.pathname.split('/')[2];

    if (sessionId) {
      await handleMessagePost(req, res, sessionId, state);
    } else {
      res.writeHead(400);
      res.end('Invalid session ID');
    }
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
};

/**
 * Start HTTP transport server
 *
 * @param mcpServer - MCP server instance
 * @param options - Global options (default parameter)
 */
const startHttpTransport = async (mcpServer: McpServer, options = OPTIONS): Promise<void> => {
  const state = createHttpTransportState(mcpServer);

  // Set up request handler
  state.server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    handleHttpRequest(req, res, state, options);
  });

  // Start server
  return new Promise((resolve, reject) => {
    state.server.listen(options.port || 3000, options.host || 'localhost', () => {
      console.log(`PatternFly MCP server running on http://${options.host || 'localhost'}:${options.port || 3000}`);
      resolve();
    });
    state.server.on('error', reject);
  });
};

/**
 * Stop HTTP transport server
 *
 * @param state - Transport state
 */
const stopHttpTransport = async (state: HttpTransportState): Promise<void> => new Promise(resolve => {
  state.server.close(resolve);
});

export {
  startHttpTransport,
  stopHttpTransport,
  type HttpTransportState
};
