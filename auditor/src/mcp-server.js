#!/usr/bin/env node

/**
 * MCP Server Process Management
 *
 * Handles starting, stopping, and checking status of the PatternFly MCP server.
 */

import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = dirname(dirname(__dirname)); // Go up from auditor/src/ to root

// PID file location
const PID_FILE = join(ROOT_DIR, '.mcp-server.pid');

/**
 * Get MCP server command and args
 */
function getMcpServerCommand() {
  // Check if built server exists - use cli.js for proper CLI mode
  const builtServer = join(ROOT_DIR, 'dist', 'cli.js');
  if (existsSync(builtServer)) {
    return {
      command: 'node',
      args: [builtServer, '--http', '--port', '3000', '--host', '0.0.0.0']
    };
  }

  // Check if we need to build first
  console.warn('⚠️  Built server not found. Attempting to use npx...');
  console.warn('   If this fails, build the server first: npm run build');

  // Fallback to npx (if published)
  return {
    command: 'npx',
    args: ['@patternfly/patternfly-mcp', '--http', '--port', '3000', '--host', '0.0.0.0']
  };
}

/**
 * Check if MCP server is running
 */
function isServerRunning(pid) {
  if (!pid) return false;

  try {
    // Check if process exists (Unix: signal 0, doesn't kill process)
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Read PID from file
 */
function readPid() {
  if (!existsSync(PID_FILE)) {
    return null;
  }

  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch (error) {
    return null;
  }
}

/**
 * Write PID to file
 */
function writePid(pid) {
  writeFileSync(PID_FILE, pid.toString(), 'utf8');
}

/**
 * Delete PID file
 */
function deletePid() {
  if (existsSync(PID_FILE)) {
    unlinkSync(PID_FILE);
  }
}

/**
 * Start MCP server
 */
async function startServer() {
  // Check if already running
  const existingPid = readPid();
  if (existingPid && isServerRunning(existingPid)) {
    console.warn(`✅ MCP server is already running (PID: ${existingPid})`);
    return existingPid;
  }

  // Clean up stale PID file
  if (existingPid) {
    deletePid();
  }

  const { command, args } = getMcpServerCommand();

  console.warn(`🚀 Starting MCP server...`);
  console.warn(`   Command: ${command} ${args.join(' ')}`);

  // Wait for server to be ready using health check (more reliable than parsing logs)
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false, // Keep attached to monitor process
      cwd: ROOT_DIR
    });

    // Track if process exited early
    let processExited = false;
    let exitCode = null;
    let errorOutput = '';
    let serverReady = false;

    proc.on('error', (error) => {
      clearTimeout(timeout);
      deletePid();
      reject(new Error(`Failed to start MCP server: ${error.message}`));
    });

    proc.on('exit', (code, signal) => {
      processExited = true;
      exitCode = code;
      if (code !== 0 && code !== null && !serverReady) {
        clearTimeout(timeout);
        deletePid();
        reject(new Error(`MCP server exited with code ${code}${errorOutput ? `\nServer errors: ${errorOutput}` : ''}`));
      }
    });

    // Forward server output for debugging
    proc.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    proc.stderr.on('data', (data) => {
      const output = data.toString();
      errorOutput += output;
      process.stderr.write(data);
    });

    // Write PID file immediately
    writePid(proc.pid);

    const timeout = setTimeout(() => {
      if (!serverReady) {
        if (processExited) {
          deletePid();
          reject(new Error(`MCP server process exited early (code: ${exitCode})${errorOutput ? `\nServer errors: ${errorOutput}` : ''}`));
        } else {
          // Clean up PID file if server failed to start
          deletePid();
          reject(new Error('MCP server failed to start within 15 seconds'));
        }
      }
    }, 15000);

    // Small delay before starting health check to allow server to initialize
    setTimeout(() => {
      // Health check function (same as mcp-start-simple.js)
      const waitForServer = async (maxWait = 15000) => {
      return new Promise((resolveHealth) => {
        const startTime = Date.now();
        const checkInterval = 500;

        const check = async () => {
          // Check if process exited early
          if (processExited) {
            resolveHealth(false);
            return;
          }

          try {
            const http = await import('http');
            const req = http.request({
              hostname: 'localhost',
              port: 3000,
              method: 'POST',
              path: '/mcp',
              timeout: 1000,
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/event-stream'
              }
            }, (res) => {
              // Any response means server is up (even errors are fine - server is responding)
              let responseData = '';
              res.on('data', (chunk) => {
                responseData += chunk.toString();
              });
              res.on('end', () => {
                resolveHealth(true);
              });
            });

            req.on('error', () => {
              // Server not ready yet, check again
              if (Date.now() - startTime < maxWait && !processExited) {
                setTimeout(check, checkInterval);
              } else {
                resolveHealth(false);
              }
            });

            req.on('timeout', () => {
              req.destroy();
              if (Date.now() - startTime < maxWait && !processExited) {
                setTimeout(check, checkInterval);
              } else {
                resolveHealth(false);
              }
            });

            // Send a minimal valid JSON-RPC request
            req.write(JSON.stringify({
              jsonrpc: '2.0',
              method: 'initialize',
              id: 1,
              params: {}
            }));
            req.end();
          } catch (error) {
            if (Date.now() - startTime < maxWait && !processExited) {
              setTimeout(check, checkInterval);
            } else {
              resolveHealth(false);
            }
          }
        };

        check();
      });
    };

      // Start health check
      waitForServer(15000).then((ready) => {
      if (ready) {
        serverReady = true;
        clearTimeout(timeout);
        // Detach process so it can continue running
        proc.unref();
        console.warn(`\n✅ MCP server started (PID: ${proc.pid})`);
        console.warn(`   Server running on http://localhost:3000`);
        resolve(proc.pid);
      } else {
        clearTimeout(timeout);
        if (processExited) {
          deletePid();
          reject(new Error(`MCP server process exited early (code: ${exitCode})${errorOutput ? `\nServer errors: ${errorOutput}` : ''}`));
        } else {
          deletePid();
          reject(new Error('MCP server failed to start within 15 seconds'));
        }
      }
    });
    }, 500); // Wait 500ms before starting health check
  });
}

/**
 * Stop MCP server
 */
async function stopServer() {
  const pid = readPid();

  if (!pid) {
    console.warn('ℹ️  No MCP server PID file found (server may not be running)');
    return;
  }

  if (!isServerRunning(pid)) {
    console.warn(`ℹ️  MCP server process ${pid} is not running (stale PID file)`);
    deletePid();
    return;
  }

  try {
    console.warn(`🛑 Stopping MCP server (PID: ${pid})...`);
    process.kill(pid, 'SIGTERM');

    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check if still running
    if (isServerRunning(pid)) {
      console.warn(`⚠️  Process still running, sending SIGKILL...`);
      process.kill(pid, 'SIGKILL');
    }

    deletePid();
    console.warn(`✅ MCP server stopped`);
  } catch (error) {
    console.error(`❌ Error stopping MCP server: ${error.message}`);
    deletePid(); // Clean up PID file anyway
    throw error;
  }
}

/**
 * Check MCP server status
 */
function checkStatus() {
  const pid = readPid();

  if (!pid) {
    console.warn('❌ MCP server is not running (no PID file)');
    return false;
  }

  if (isServerRunning(pid)) {
    console.warn(`✅ MCP server is running (PID: ${pid})`);
    console.warn(`   Server should be available at http://localhost:3000`);
    return true;
  } else {
    console.warn(`❌ MCP server PID file exists but process is not running (stale PID)`);
    deletePid();
    return false;
  }
}

/**
 * Main CLI handler
 */
async function main() {
  const command = process.argv[2];

  try {
    switch (command) {
      case 'start':
        await startServer();
        break;
      case 'stop':
        await stopServer();
        break;
      case 'status':
        checkStatus();
        break;
      default:
        console.warn(`
MCP Server Management

Usage:
  node mcp-server.js <command>

Commands:
  start   Start MCP server in HTTP mode
  stop    Stop running MCP server
  status  Check if MCP server is running

Examples:
  node mcp-server.js start
  node mcp-server.js status
  node mcp-server.js stop
`);
        process.exit(command ? 1 : 0);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { startServer, stopServer, checkStatus };

