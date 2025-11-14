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
  // Check if built server exists
  const builtServer = join(ROOT_DIR, 'dist', 'index.js');
  if (existsSync(builtServer)) {
    return {
      command: 'node',
      args: [builtServer, '--http', '--port', '3000', '--host', 'localhost']
    };
  }

  // Check if we need to build first
  console.warn('⚠️  Built server not found. Attempting to use npx...');
  console.warn('   If this fails, build the server first: npm run build');

  // Fallback to npx (if published)
  return {
    command: 'npx',
    args: ['@patternfly/patternfly-mcp', '--http', '--port', '3000', '--host', 'localhost']
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
    console.log(`✅ MCP server is already running (PID: ${existingPid})`);
    return existingPid;
  }

  // Clean up stale PID file
  if (existingPid) {
    deletePid();
  }

  const { command, args } = getMcpServerCommand();
  
  console.log(`🚀 Starting MCP server...`);
  console.log(`   Command: ${command} ${args.join(' ')}`);

  const proc = spawn(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  // Wait for server to be ready
  return new Promise((resolve, reject) => {
    let serverReady = false;
    const timeout = setTimeout(() => {
      if (!serverReady) {
        proc.kill();
        reject(new Error('MCP server failed to start within 10 seconds'));
      }
    }, 10000);

    proc.stdout.on('data', (data) => {
      const output = data.toString();
      // Look for server ready message
      if (output.includes('PatternFly MCP server running on http://')) {
        serverReady = true;
        clearTimeout(timeout);
        writePid(proc.pid);
        console.log(`✅ MCP server started (PID: ${proc.pid})`);
        console.log(`   Server running on http://localhost:3000`);
        resolve(proc.pid);
      }
    });

    proc.stderr.on('data', (data) => {
      const error = data.toString();
      if (error.includes('Error:') || error.includes('EADDRINUSE')) {
        clearTimeout(timeout);
        proc.kill();
        reject(new Error(`MCP server error: ${error}`));
      }
    });

    proc.on('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start MCP server: ${error.message}`));
    });

    proc.on('exit', (code) => {
      if (code !== 0 && code !== null && !serverReady) {
        clearTimeout(timeout);
        reject(new Error(`MCP server exited with code ${code}`));
      }
    });

    // Don't wait for process to exit (it runs indefinitely)
    // Just wait for ready signal
  });
}

/**
 * Stop MCP server
 */
async function stopServer() {
  const pid = readPid();
  
  if (!pid) {
    console.log('ℹ️  No MCP server PID file found (server may not be running)');
    return;
  }

  if (!isServerRunning(pid)) {
    console.log(`ℹ️  MCP server process ${pid} is not running (stale PID file)`);
    deletePid();
    return;
  }

  try {
    console.log(`🛑 Stopping MCP server (PID: ${pid})...`);
    process.kill(pid, 'SIGTERM');
    
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check if still running
    if (isServerRunning(pid)) {
      console.log(`⚠️  Process still running, sending SIGKILL...`);
      process.kill(pid, 'SIGKILL');
    }
    
    deletePid();
    console.log(`✅ MCP server stopped`);
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
    console.log('❌ MCP server is not running (no PID file)');
    return false;
  }

  if (isServerRunning(pid)) {
    console.log(`✅ MCP server is running (PID: ${pid})`);
    console.log(`   Server should be available at http://localhost:3000`);
    return true;
  } else {
    console.log(`❌ MCP server PID file exists but process is not running (stale PID)`);
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
        console.log(`
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

