#!/usr/bin/env node

// HTTP transport client for E2E testing using programmatic API
import { type IncomingMessage } from 'node:http';
// E2E tests import from dist (built output) - these files exist at runtime
// @ts-expect-error - dist files exist at runtime for E2E tests
import { runServer, type ServerInstance } from '../../dist/server.js';
// @ts-expect-error - dist files exist at runtime for E2E tests
import { setOptions } from '../../dist/options.context.js';
// @ts-expect-error - dist files exist at runtime for E2E tests
import { type CliOptions, type GlobalOptions } from '../../dist/options.js';

// JSON-like value used in requests/responses
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface RpcError {
  code: number;
  message: string;
  data?: Json;
}

export interface RpcResultCommon {
  content?: Array<({ text?: string } & Record<string, unknown>)>;
  tools?: Array<({ name: string } & Record<string, unknown>)>;
  [k: string]: unknown;
}

export interface RpcResponse {
  jsonrpc?: '2.0';
  id: number | string;
  result?: RpcResultCommon;
  error?: RpcError;
}

export interface RpcRequest {
  jsonrpc?: '2.0';
  id?: number | string;
  method: string;
  params?: Json;
}

export interface StartHttpServerOptions {
  port?: number;
  host?: string;
  allowedOrigins?: string[];
  allowedHosts?: string[];
  killExisting?: boolean;
  docsHost?: boolean;
}

export interface HttpTransportClient {
  baseUrl: string;
  sessionId?: string | undefined;
  send: (request: RpcRequest, opts?: { timeoutMs?: number; headers?: Record<string, string> }) => Promise<RpcResponse>;
  initialize: () => Promise<RpcResponse>;
  close: () => Promise<void>;
}

interface PendingEntry {
  resolve: (value: RpcResponse) => void;
  reject: (reason?: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Start an HTTP server using the programmatic API and return a client for testing
 *
 * @param options - Server configuration options
 */
export const startHttpServer = async (options: StartHttpServerOptions = {}): Promise<HttpTransportClient> => {
  const {
    port = 3000,
    host = '127.0.0.1',
    allowedOrigins,
    allowedHosts,
    killExisting = false,
    docsHost = false
  } = options;

  // Build programmatic options
  const programmaticOptions: Partial<CliOptions> = {
    http: true,
    port,
    host,
    killExisting,
    docsHost
  };

  if (allowedOrigins) {
    programmaticOptions.allowedOrigins = allowedOrigins;
  }

  if (allowedHosts) {
    programmaticOptions.allowedHosts = allowedHosts;
  }

  // Set options in context (merges with DEFAULT_OPTIONS)
  const globalOptions = setOptions(programmaticOptions) as GlobalOptions;

  // Start server using runServer directly (avoids process.exit in error cases)
  const server: ServerInstance = await runServer(globalOptions, { allowProcessExit: false });

  // Construct base URL from options
  const baseUrl = `http://${host}:${port}`;

  let sessionId: string | undefined;
  const pendingRequests = new Map<string, PendingEntry>();
  let requestId = 0;

  /**
   * Create HTTP transport client
   */
  const client: HttpTransportClient = {
    baseUrl,
    sessionId,

    async send(request: RpcRequest, opts: { timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<RpcResponse> {
      const { timeoutMs = 10000, headers = {} } = opts;

      return new Promise((resolve, reject) => {
        const id = (requestId += 1).toString();
        const timer = setTimeout(() => {
          pendingRequests.delete(id);
          reject(new Error(`Request timeout after ${timeoutMs}ms`));
        }, timeoutMs);

        pendingRequests.set(id, { resolve, reject, timer });

        // Prepare headers
        const requestHeaders: Record<string, string> = {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          ...headers
        };

        // Add session ID if available
        if (sessionId) {
          requestHeaders['mcp-session-id'] = sessionId;
        }

        // Make HTTP request
        const postData = JSON.stringify({ ...request, id });
        const url = new URL('/mcp', baseUrl);

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const httpRequest = require('http').request({
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: requestHeaders
        }, (response: IncomingMessage) => {
          let data = '';

          response.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });

          response.on('end', () => {
            try {
              // Handle SSE response
              if (response.headers['content-type']?.includes('text/event-stream')) {
                // Extract session ID from headers
                const sessionIdHeader = response.headers['mcp-session-id'];

                if (sessionIdHeader && typeof sessionIdHeader === 'string') {
                  sessionId = sessionIdHeader;
                }

                // Parse SSE data
                const lines = data.split('\n');

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const jsonData = line.substring(6);

                    if (jsonData.trim()) {
                      const parsed = JSON.parse(jsonData);
                      const entry = pendingRequests.get(id);

                      if (entry) {
                        clearTimeout(entry.timer);
                        pendingRequests.delete(id);
                        entry.resolve(parsed);
                      }

                      return;
                    }
                  }
                }
              } else {
                // Handle regular JSON response
                const parsed = JSON.parse(data);

                // Extract session ID from response if available
                if (parsed.result?.sessionId && typeof parsed.result.sessionId === 'string') {
                  sessionId = parsed.result.sessionId;
                }

                const entry = pendingRequests.get(id);

                if (entry) {
                  clearTimeout(entry.timer);
                  pendingRequests.delete(id);
                  entry.resolve(parsed);
                }
              }
            } catch (error) {
              const entry = pendingRequests.get(id);

              if (entry) {
                clearTimeout(entry.timer);
                pendingRequests.delete(id);
                entry.reject(new Error(`Failed to parse response: ${error}`));
              }
            }
          });
        });

        httpRequest.on('error', (error: Error) => {
          const entry = pendingRequests.get(id);

          if (entry) {
            clearTimeout(entry.timer);
            pendingRequests.delete(id);
            entry.reject(error);
          }
        });

        httpRequest.write(postData);
        httpRequest.end();
      });
    },

    async initialize(): Promise<RpcResponse> {
      const response = await this.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: {
            name: 'test-client',
            version: '1.0.0'
          }
        }
      });

      // Extract session ID from response if available
      if (response.result?.sessionId && typeof response.result.sessionId === 'string') {
        sessionId = response.result.sessionId;
      }

      return response;
    },

    async close(): Promise<void> {
      // Clear pending requests
      for (const [_id, entry] of pendingRequests) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Client closed'));
      }
      pendingRequests.clear();

      // Stop the server using programmatic API
      await server.stop();
    }
  };

  return client;
};
