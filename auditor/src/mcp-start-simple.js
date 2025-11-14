#!/usr/bin/env node

/**
 * Simple MCP Server Starter
 * 
 * Starts the MCP server using npm scripts and waits for it to be ready.
 * This is a simpler alternative to the full mcp-server.js management script.
 */

import { spawn, execSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = dirname(dirname(__dirname)); // Go up from auditor/src/ to root
const PID_FILE = join(ROOT_DIR, '.mcp-server.pid');

function waitForServer(maxWait = 10000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const checkInterval = 500;
    
    const check = async () => {
      try {
        // Use http module instead of fetch for better compatibility
        const http = await import('http');
        const req = http.request({
          hostname: 'localhost',
          port: 3000,
          method: 'POST',
          path: '/mcp',
          timeout: 1000,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream' // Required for MCP HTTP transport
          }
        }, (res) => {
          // Any response means server is up (even errors are fine - server is responding)
          // Consume response to avoid hanging and prevent error messages
          let responseData = '';
          res.on('data', (chunk) => {
            responseData += chunk.toString();
          });
          res.on('end', () => {
            // Server responded, it's ready (even if it's an error response)
            resolve(true);
          });
        });
        
        req.on('error', () => {
          // Server not ready yet, check again
          if (Date.now() - startTime < maxWait) {
            setTimeout(check, checkInterval);
          } else {
            resolve(false);
          }
        });
        
        req.on('timeout', () => {
          req.destroy();
          if (Date.now() - startTime < maxWait) {
            setTimeout(check, checkInterval);
          } else {
            resolve(false);
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
        if (Date.now() - startTime < maxWait) {
          setTimeout(check, checkInterval);
        } else {
          resolve(false);
        }
      }
    };
    
    check();
  });
}

/**
 * Kill any existing MCP server processes
 */
async function killExistingServers() {
  console.log('🧹 Cleaning up any existing MCP server instances...');
  
  // Kill any processes on port 3000 first (most reliable)
  try {
    execSync('lsof -ti:3000 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' });
  } catch (e) {
    // Ignore errors
  }
  
  // Kill any node processes running the MCP server
  try {
    execSync('pkill -9 -f "node.*dist/index.js.*--http" 2>/dev/null || true', { stdio: 'ignore' });
  } catch (e) {
    // Ignore errors
  }
  
  // Try to stop via PID file
  if (existsSync(PID_FILE)) {
    try {
      const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (!isNaN(pid) && isProcessRunning(pid)) {
        try {
          process.kill(pid, 'SIGTERM');
          // Wait for graceful shutdown
          await new Promise(resolve => setTimeout(resolve, 500));
          if (isProcessRunning(pid)) {
            process.kill(pid, 'SIGKILL');
          }
        } catch (e) {
          // Process doesn't exist
        }
      }
      unlinkSync(PID_FILE);
    } catch (e) {
      // Ignore errors
    }
  }
  
  // Give processes a moment to fully die
  await new Promise(resolve => setTimeout(resolve, 500));
}

/**
 * Check if a process is running
 */
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

async function main() {
  // Kill any existing servers first
  await killExistingServers();
  
  console.log('🚀 Starting MCP server...');
  
  // Check if server is built - use cli.js for proper CLI mode
  const builtServer = join(ROOT_DIR, 'dist', 'cli.js');
  if (!existsSync(builtServer)) {
    console.error('❌ Server not built. Run: npm run build');
    process.exit(1);
  }
  
  // Start server in background
  // Use '0.0.0.0' as host so it's accessible from containers on macOS Podman
  // Use 'pipe' for stdout/stderr so we can filter out expected errors from readiness checks
  // Use detached: true to run as daemon, but keep process reference to prevent early exit
  const proc = spawn('node', [builtServer, '--http', '--port', '3000', '--host', '0.0.0.0'], {
    cwd: ROOT_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true  // Run as daemon
  });
  
  // Track if process exited early
  let processExited = false;
  let exitCode = null;
  let exitSignal = null;
  let errorOutput = '';
  
  proc.on('error', (error) => {
    console.error(`❌ Failed to start server process: ${error.message}`);
    processExited = true;
  });
  
  proc.on('exit', (code, signal) => {
    processExited = true;
    exitCode = code;
    exitSignal = signal;
  });
  
  // Forward server output but filter out the expected "Not Acceptable" error from readiness checks
  // Only filter if it's the JSON error response, not other important messages
  proc.stdout.on('data', (data) => {
    const output = data.toString();
    // Filter out the JSON error response from readiness checks, but keep all other output
    // This includes kill messages, tool registrations, and startup messages
    const lines = output.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip the JSON error response from readiness checks
      if (trimmed && !trimmed.startsWith('{"jsonrpc":"2.0","error":{"code":-32000,"message":"Not Acceptable')) {
        process.stdout.write(line + (line.endsWith('\n') ? '' : '\n'));
      }
    }
  });
  
  proc.stderr.on('data', (data) => {
    // Don't filter stderr - it might contain important error messages including kill status
    const output = data.toString();
    errorOutput += output;
    process.stderr.write(data);
  });
  
  // Keep process reference to prevent early exit
  // The server should stay running because the HTTP server keeps the event loop alive
  // We don't call unref() so the parent process keeps a reference, but detached: true
  // ensures the child can outlive the parent
  
  // Write PID file so server can be stopped via mcp-server.js stop
  try {
    writeFileSync(PID_FILE, proc.pid.toString(), 'utf8');
  } catch (error) {
    console.warn(`⚠️  Failed to write PID file: ${error.message}`);
  }
  
  // Wait for server to be ready
  console.log('⏳ Waiting for server to be ready...');
  const ready = await waitForServer(20000); // Increased timeout to 20 seconds
  
  // Check if process exited early
  if (processExited) {
    console.error(`❌ MCP server process exited early (code: ${exitCode}, signal: ${exitSignal})`);
    if (errorOutput) {
      console.error('Server error output:');
      console.error(errorOutput);
    }
    // Clean up PID file
    if (existsSync(PID_FILE)) {
      try {
        unlinkSync(PID_FILE);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    process.exit(1);
  }
  
  if (ready) {
    console.log(`✅ MCP server is ready at http://localhost:3000 (PID: ${proc.pid})`);
    process.exit(0);
  } else {
    console.error('❌ MCP server failed to start within 20 seconds');
    // Check if process is still running
    try {
      process.kill(proc.pid, 0); // Check if process exists
      console.error(`   Process ${proc.pid} is still running but not responding`);
    } catch (error) {
      console.error(`   Process ${proc.pid} is not running`);
    }
    if (errorOutput) {
      console.error('Server error output:');
      console.error(errorOutput);
    }
    // Clean up PID file if server failed to start
    if (existsSync(PID_FILE)) {
      try {
        unlinkSync(PID_FILE);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

