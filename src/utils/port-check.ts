import { execSync } from 'child_process';
import { platform } from 'os';
import { kill } from 'process';

/**
 * Get process information for a port
 * 
 * @param port - Port number to check
 * @returns Process info or null if port is free
 */
export function getProcessOnPort(port: number): { pid: number; command: string } | null {
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
}

/**
 * Check if a process is the same MCP server instance
 * 
 * @param command - Command string to check
 * @returns True if it's the same MCP server
 */
export function isSameMcpServer(command: string): boolean {
  return command.includes('dist/index.js') && command.includes('--http');
}

/**
 * Kill a process by PID
 * 
 * @param pid - Process ID to kill
 * @returns True if successful, false otherwise
 */
export function killProcess(pid: number): boolean {
  try {
    // Try graceful shutdown first
    kill(pid, 'SIGTERM');
    
    // Wait a moment for graceful shutdown (polling)
    const startTime = Date.now();
    const checkInterval = 100; // Check every 100ms
    const maxWait = 1000; // Wait up to 1 second
    
    while (Date.now() - startTime < maxWait) {
      try {
        // Check if process still exists (signal 0 doesn't kill)
        kill(pid, 0);
        // Process still exists, wait a bit
        const start = Date.now();
        while (Date.now() - start < checkInterval) {
          // Busy wait (cross-platform)
        }
      } catch {
        // Process is gone, success!
        return true;
      }
    }
    
    // If still running, force kill
    try {
      kill(pid, 0); // Check if still exists
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
  } catch (error) {
    return false;
  }
}

/**
 * Format helpful error message for port conflicts
 * 
 * @param port - Port number
 * @param processInfo - Process information
 * @returns Formatted error message
 */
export function formatPortConflictError(port: number, processInfo: { pid: number; command: string }): string {
  const isSameProcess = isSameMcpServer(processInfo.command);
  
  let message = `\n❌ Port ${port} is already in use.\n\n`;
  message += `   Process: PID ${processInfo.pid}\n`;
  message += `   Command: ${processInfo.command}\n\n`;
  
  if (isSameProcess) {
    message += `   This appears to be another instance of the PatternFly MCP server.\n`;
    message += `   You can kill it with: kill ${processInfo.pid}\n`;
    message += `   Or use --kill-existing flag to automatically kill it.\n`;
    message += `   Or use a different port: --port <different-port>\n`;
  } else {
    message += `   This is a different process. To use this port, you'll need to:\n`;
    message += `   1. Stop the process: kill ${processInfo.pid}\n`;
    message += `   2. Or use a different port: --port <different-port>\n`;
  }
  
  return message;
}

