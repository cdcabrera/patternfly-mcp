import { execSync } from 'node:child_process';
import { platform } from 'node:os';
import { kill } from 'node:process';

/**
 * Get process information for a port
 *
 * @param port - Port number to check
 * @returns Process info or null if port is free
 */
const getProcessOnPort = (port: number): { pid: number; command: string } | null => {
  try {
    const isWindows = platform() === 'win32';
    let pid: number | null = null;
    let command = 'unknown';

    if (isWindows) {
      // Windows: Use netstat to find PID
      try {
        const netstatOutput = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const lines = netstatOutput.split('\n');

        for (const line of lines) {
          if (line.includes('LISTENING')) {
            const parts = line.trim().split(/\s+/);
            const lastPart = parts[parts.length - 1];

            if (lastPart) {
              const foundPid = parseInt(lastPart, 10);

              if (!isNaN(foundPid)) {
                pid = foundPid;
                break;
              }
            }
          }
        }

        if (pid) {
          // Get command name on Windows
          try {
            command = execSync(`tasklist /FI "PID eq ${pid}" /FO LIST /NH`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
          } catch {
            // Ignore
          }
        }
      } catch {
        return null;
      }
    } else {
      // Unix/macOS: Use lsof
      try {
        const output = execSync(`lsof -ti:${port} -sTCP:LISTEN`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

        if (!output) {
          return null;
        }

        const firstLine = output.split('\n')[0];

        if (!firstLine) {
          return null;
        }

        pid = parseInt(firstLine, 10);

        if (isNaN(pid)) {
          return null;
        }

        // Get command name for the PID
        try {
          command = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        } catch {
          // Ignore
        }
      } catch {
        return null;
      }
    }

    if (pid === null) {
      return null;
    }

    return { pid, command };
  } catch {
    return null;
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
 * Kill a process by PID
 *
 * @param pid - Process ID to kill
 * @returns True if successful, false otherwise
 */
const killProcess = (pid: number) => {
  try {
    // Attempt a graceful shutdown
    kill(pid, 'SIGTERM');

    // Wait a moment for the graceful shutdown (polling)
    const startTime = Date.now();
    const checkInterval = 100; // Check every 100ms
    const maxWait = 1000; // Wait up to 1 second

    // Check if the process still exists
    while (Date.now() - startTime < maxWait) {
      try {
        kill(pid, 0);
        const start = Date.now();

        while (Date.now() - start < checkInterval) {
          // Busy wait (cross-platform)
        }
      } catch {
        return true;
      }
    }

    // Process is still running, force kill
    try {
      kill(pid, 0);
      kill(pid, 'SIGKILL');
      // Give it a moment
      const start = Date.now();

      while (Date.now() - start < 200) {
        // Busy wait
      }

      return true;
    } catch {
      // Process already gone
      return true;
    }
  } catch {
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
const formatPortConflictError = (port: number, processInfo: { pid: number; command: string }) => {
  const isSameProcess = isSameMcpServer(processInfo.command);

  const message = [
    `\n❌ Port ${port} is already in use.`,
    `\tProcess: PID ${processInfo.pid}`,
    `\tCommand: ${processInfo.command}`
  ];

  if (isSameProcess) {
    message.push(
      `\n\tThis appears to be another instance of the server.`,
      `\tYou can kill it with: kill ${processInfo.pid}`,
      `\tOr use --kill-existing flag to automatically kill it.`,
      `\tOr use a different port: --port <different-port>`
    );
  } else {
    message.push(
      `\n\tThis may be a different process. To use this port, you will need to:`,
      `\t1. Stop the process: kill ${processInfo.pid}`,
      `\t2. Or use a different port: --port <different-port>`
    );
  }

  return message.join('\n');
};

export { formatPortConflictError, getProcessOnPort, isSameMcpServer, killProcess };

