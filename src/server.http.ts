import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport, type StreamableHTTPServerTransportOptions } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { portToPid } from 'pid-port';
import fkill from 'fkill';
import packageJson from '../package.json';
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
        // Use PowerShell to get the full command with arguments (required for isSameMcpServer detection)
        try {
          const psCmd = `powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter \\"ProcessId=${pid}\\").CommandLine"`;

          command = execSync(psCmd, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore']
          }).trim();
        } catch {
          // Fallback to "tasklist" if PowerShell fails (only provides process name, not full command line)
          try {
            command = execSync(`tasklist /FI "PID eq ${pid}" /FO LIST /NH`, {
              encoding: 'utf8',
              stdio: ['ignore', 'pipe', 'ignore']
            }).trim();
          } catch {
            // Ignore - command stays 'unknown'
          }
        }
      } else {
        try {
          command = execSync(`ps -p ${pid} -o command=`, {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
          }).trim();
        } catch (error) {
          // If ps fails, check if it's the current process (programmatic usage scenario)
          // If so, construct command from process.argv to help with detection
          if (pid === process.pid) {
            // For current process, construct command from argv
            // This helps isSameMcpServer detect it when ps fails
            const argv = process.argv;
            if (argv && argv.length > 0) {
              command = argv.join(' ');
            }
            // If argv construction also fails, command stays 'unknown' and will be handled by killExisting logic
          }
          // If not current process and ps failed, command stays 'unknown'
        }
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
 * Identity tokens for the MCP server process. Generated from package.json bin entries
 * plus the built entry point.
 */
const SAME_SERVER_TOKENS = [
  'dist/index.js',
  ...Object.keys(packageJson.bin || {})
];

/**
 * HTTP mode, check if the process is the MCP server instance
 *
 * Consider it a match if the command appears to invoke
 * - binary
 * - built entry point AND includes the `--http` flag
 *
 * @param rawCommand - Raw command string to check
 * @returns True if it's the same MCP server
 */
const isSameMcpServer = (rawCommand: string): boolean => {
  if (!rawCommand) {
    return false;
  }

  // Normalize to improve cross-platform matching
  const cmd = rawCommand
    .replace(/\\/g, '/') // Windows paths to forward slashes
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Check for --http flag with word boundaries
  const hasHttpFlag = /(^|\s)--http(\s|$)/.test(cmd);

  if (!hasHttpFlag) {
    return false;
  }

  return SAME_SERVER_TOKENS.some(t => cmd.includes(t.toLowerCase()));
};

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
    await fkill(pid, {
      forceAfterTimeout: maxWait,
      waitForExit: maxWait + 1000,
      silent: true
    });

    console.log(`Process ${pid} has exited`);

    return true;
  } catch (error) {
    console.log(`Process ${pid} has failed to shutdown. You may need to stop the process or use a different port.`, error);

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
    `\nPort ${port} is already in use.`
  ];

  if (processInfo && isSameMcpServer(processInfo.command)) {
    message.push(
      `\tProcess: PID ${processInfo.pid}`,
      `\tCommand: ${processInfo.command}`,
      `\n\tThis appears to be another instance of the server.`,
      `\tRecommended:`,
      `\t1. Rerun with the --kill-existing flag to stop it automatically.`,
      `\t2. Or use a different port: --port <different-port>`
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
  const transportOptions: StreamableHTTPServerTransportOptions = {
    sessionIdGenerator: () => randomUUID(),
    enableJsonResponse: false, // Use SSE streaming
    enableDnsRebindingProtection: true,
    onsessioninitialized: (sessionId: string) => {
      console.log(`Session initialized: ${sessionId}`);
    },
    onsessionclosed: (sessionId: string) => {
      console.log(`Session closed: ${sessionId}`);
    }
  };

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
 * HTTP server handle for lifecycle management
 */
type HttpServerHandle = {
  close: () => Promise<void>;
  port: number;
};

/**
 * Registry of running HTTP server instances by port
 * Used for graceful shutdown in programmatic usage (same process)
 */
const httpServerRegistry = new Map<number, HttpServerHandle>();

/**
 * Get registered HTTP server instance for a port
 */
const getRegisteredServer = (port: number): HttpServerHandle | undefined => {
  return httpServerRegistry.get(port);
};

/**
 * Register an HTTP server instance
 */
const registerServer = (port: number, handle: HttpServerHandle): void => {
  httpServerRegistry.set(port, handle);
};

/**
 * Unregister an HTTP server instance
 */
const unregisterServer = (port: number): void => {
  httpServerRegistry.delete(port);
};

/**
 * Start the HTTP transport server
 *
 * @param mcpServer - MCP server instance
 * @param options - Global options (default parameter)
 * @returns Handle with close method for server lifecycle management
 */
const startHttpTransport = async (mcpServer: McpServer, options = getOptions()): Promise<HttpServerHandle> => {
  const { port, name, host } = options;

  if (!port || !host) {
    throw new Error('Port and host options are required for HTTP transport');
  }

  const transport = createStreamableHttpTransport(options);

  // Connect MCP server to transport
  await mcpServer.connect(transport);

  // Set up
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void handleStreamableHttpRequest(req, res, transport);
  });
  
  // Store transport reference for cleanup
  let transportRef: StreamableHTTPServerTransport | null = transport;

  // Check for port conflicts and handle kill-existing BEFORE creating the Promise
  if (options.killExisting) {
    // First, check if there's a registered server instance for this port (programmatic usage)
    const registeredServer = getRegisteredServer(port);
    if (registeredServer) {
      console.log(`Closing existing HTTP server instance on port ${port}...`);
      await registeredServer.close();
      // Give the OS a moment to release the port (helps with TIME_WAIT)
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 200);
        // Don't keep process alive if this is the only thing running
        timer.unref();
      });
    }
    // Note: We don't check getProcessOnPort here because:
    // 1. If there's a registered server, we closed it above
    // 2. If there's no registered server but port is in use, server.listen() will throw EADDRINUSE
    // 3. The EADDRINUSE handler below will provide a helpful error message
  }

  // Start the server. Port should be free now, or we'll get an error
  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, () => {
      console.log(`${name} server running on http://${host}:${port}`);
      resolve();
    });

    server.on('error', async (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        // Port is in use - check if it's our process (TIME_WAIT) or a different process
        const processInfo = await getProcessOnPort(port);
        
        if (processInfo && processInfo.pid === process.pid) {
          // Port is in use by current process - likely TIME_WAIT from previous close()
          // Wait a bit and retry once
          console.warn(`Port ${port} is in use by the current process (likely TIME_WAIT). Waiting...`);
          await new Promise(resolve => {
            const timer = setTimeout(resolve, 300);
            // Don't keep process alive if this is the only thing running
            timer.unref();
          });
          
          // Try to listen again (this will either succeed or fail with a clearer error)
          server.listen(port, host, () => {
            console.log(`${name} server running on http://${host}:${port}`);
            resolve();
          });
          return; // Don't reject - we're retrying
        }
        
        // Different process or couldn't determine - provide helpful error
        const errorMessage = formatPortConflictError(port, processInfo);
        console.error(errorMessage);
        reject(processInfo 
          ? new Error(`Port ${port} is already in use by PID ${processInfo.pid}`, { cause: processInfo })
          : error);
      } else {
        console.error(`HTTP server error: ${error}`);
        reject(error);
      }
    });
  });

  const handle: HttpServerHandle = {
    port,
    close: async () => {
      // Remove all listeners to prevent them from keeping the process alive
      server.removeAllListeners('error');
      server.removeAllListeners('listening');
      server.removeAllListeners('request');
      server.removeAllListeners('connection');
      server.removeAllListeners('close');
      
      // Close all active connections immediately
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
      
      // Close the HTTP server - use destroy() if available for immediate closure
      await new Promise<void>((resolve) => {
        let resolved = false;
        
        const timeout = setTimeout(() => {
          // If close times out, destroy the server to force close
          if (!resolved) {
            resolved = true;
            server.removeAllListeners();
            if (typeof (server as any).destroy === 'function') {
              (server as any).destroy();
            }
            resolve();
          }
        }, 50); // Reduced timeout for faster shutdown
        // Don't keep process alive if this is the only thing running
        timeout.unref();
        
        server.close(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            resolve();
          }
        });
      });
      
      // Clear transport reference
      transportRef = null;
      
      // Unregister immediately - the registry is only for finding servers to close
      // Once closed, we don't need it in the registry anymore
      unregisterServer(port);
    }
  };

  // Register the server instance for graceful shutdown
  registerServer(port, handle);

  return handle;
};

export {
  createStreamableHttpTransport,
  formatPortConflictError,
  getProcessOnPort,
  handleStreamableHttpRequest,
  isSameMcpServer,
  killProcess,
  SAME_SERVER_TOKENS,
  startHttpTransport,
  type HttpServerHandle
};
