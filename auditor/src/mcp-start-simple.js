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
import { existsSync, readFileSync, unlinkSync } from 'fs';

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
          path: '/',
          timeout: 1000,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream' // Required for MCP HTTP transport
          }
        }, (res) => {
          // Any response means server is up (even errors are fine - server is responding)
          // Consume response to avoid hanging
          res.on('data', () => {});
          res.on('end', () => {
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
  
  // Check if server is built
  const builtServer = join(ROOT_DIR, 'dist', 'index.js');
  if (!existsSync(builtServer)) {
    console.error('❌ Server not built. Run: npm run build');
    process.exit(1);
  }
  
  // Start server in background
  const proc = spawn('node', [builtServer, '--http', '--port', '3000', '--host', 'localhost'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    detached: true
  });
  
  proc.unref();
  
  // Wait for server to be ready
  console.log('⏳ Waiting for server to be ready...');
  const ready = await waitForServer(15000);
  
  if (ready) {
    console.log('✅ MCP server is ready at http://localhost:3000');
    process.exit(0);
  } else {
    console.error('❌ MCP server failed to start within 15 seconds');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});

