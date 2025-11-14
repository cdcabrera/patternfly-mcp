#!/usr/bin/env node

/**
 * Simple MCP Server Starter
 * 
 * Starts the MCP server using npm scripts and waits for it to be ready.
 * This is a simpler alternative to the full mcp-server.js management script.
 */

import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = dirname(dirname(__dirname)); // Go up from auditor/src/ to root

import { existsSync } from 'fs';

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
          timeout: 1000
        }, (res) => {
          // Any response means server is up (even 406 is fine)
          resolve(true);
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

async function main() {
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

