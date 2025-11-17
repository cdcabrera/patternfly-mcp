import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { portToPid } from 'pid-port';
import fkill from 'fkill';
import { getOptions } from './options.context';

/**
 * Get process information for a port
 *
 * @param port - Port number to check
 * @returns Process info or undefined if port is free
 */
const getProcessOnPort = async (port: number) => {
  if (!port) {
    return undefined;
  }

  try {
    // Cross-platform PID lookup using pid-port
    const pid = await portToPid(port);

    if (!pid) {
      return undefined;
    }

    // Minimal OS-specific code for command name
    const isWindows = platform() === 'win32';
    let command = 'unknown';

    try {
      if (isWindows) {
        command = execSync(`tasklist /FI "PID eq ${pid}" /FO LIST /NH`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
      } else {
        command = execSync(`ps -p ${pid} -o command=`, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
      }
    } catch {
      // Ignore - command stays 'unknown'
    }

    return { pid, command };
  } catch {
    return undefined;
  }
};

/**
 * Check if a process is the same MCP server instance
 *
 * @param command - Command string to check
 * @returns True if it's the same MCP server
 */
const isSameMcpServer = (command: string) =>
  command.includes('dist/index.js') && command.includes('--http');

/**
 * Kill a process by PID using fkill
 *
 * @param pid - Process ID to kill
 * @param settings - Optional settings object
 * @param settings.maxWait - Maximum time to wait for graceful shutdown before force kill (default: 1000ms)
 * @returns Promise that resolves to true if successful, false otherwise
 */
const killProcess = async (pid: number, { maxWait = 1000 } = {}): Promise<boolean> => {
  console.log(`Attempting to kill process ${pid}`);

  try {
    // Use fkill with graceful shutdown, then force after timeout
    await fkill(pid, {
      forceAfterTimeout: maxWait,
      waitForExit: maxWait + 1000,
      silent: true
    });

    console.log(`Process ${pid} has exited`);

    return true;
  } catch (error) {
    console.log(`Process ${pid} has failed to shutdown:`, error);

    return false;
  }
};

/**
 * Format a helpful error message for port conflicts
 *
 * @param port - Port number
 * @param processInfo - Process information
 * @param processInfo.pid - Process ID
 * @param processInfo.command - Command string
 * @returns Formatted error message
 */
const formatPortConflictError = (port: number, processInfo?: { pid: number; command: string }) => {
  const message = [
    `\n❌ Port ${port} is already in use.`
  ];

  if (processInfo && isSameMcpServer(processInfo.command)) {
    message.push(
      `\tProcess: PID ${processInfo.pid}`,
      `\tCommand: ${processInfo.command}`,
      `\n\tThis appears to be another instance of the server.`,
      `\tYou can kill it with: kill ${processInfo.pid}`,
      `\tOr use --kill-existing flag to automatically kill it.`,
      `\tOr use a different port: --port <different-port>`
    );
  } else {
    message.push(
      `\n\tThis may be a different process. To use this port, you will need to:`,
      `\t1. Stop the process`,
      `\t2. Or use a different port: --port <different-port>`
    );
  }

  return message.join('\n');
};

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
  const { port, name, host } = options;

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
    const processInfo = await getProcessOnPort(port);

    if (processInfo) {
      if (isSameMcpServer(processInfo.command)) {
        await killProcess(processInfo.pid);
      } else {
        throw new Error(`Port ${port} is in use by a different process`, { cause: processInfo });
      }
    }
  }

  // Start server (port should be free now, or we'll get an error)
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`${name} server running on http://${host}:${port}`);
      resolve();
    });

    server.on('error', async (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        const processInfo = await getProcessOnPort(port);

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
  formatPortConflictError,
  getProcessOnPort,
  handleStreamableHttpRequest,
  isSameMcpServer,
  killProcess,
  startHttpTransport
};
