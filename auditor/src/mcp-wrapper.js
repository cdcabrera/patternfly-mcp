#!/usr/bin/env node

/**
 * MCP Wrapper Script
 * 
 * Wrapper that starts MCP server, runs auditor, and stops MCP server on exit.
 */

import { startServer, stopServer } from './mcp-server.js';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const AUDITOR_DIR = dirname(__dirname);

let mcpPid = null;

/**
 * Cleanup handler
 */
async function cleanup() {
  if (mcpPid) {
    console.log('\n🧹 Cleaning up MCP server...');
    try {
      await stopServer();
    } catch (error) {
      console.error(`⚠️  Error during cleanup: ${error.message}`);
    }
  }
}

// Register cleanup handlers
process.on('SIGINT', async () => {
  await cleanup();
  process.exit(130); // 128 + 2 (SIGINT)
});

process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(143); // 128 + 15 (SIGTERM)
});

process.on('exit', async () => {
  await cleanup();
});

/**
 * Main execution
 */
async function main() {
  console.log('🔧 MCP Wrapper: Starting MCP server and running auditor\n');

  try {
    // Start MCP server
    console.log('📡 Starting MCP server...');
    mcpPid = await startServer();
    console.log('');

    // Wait a moment for server to be fully ready
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Run auditor with remaining args
    const auditorArgs = process.argv.slice(2);
    console.log('🔍 Running auditor...\n');

    const auditorProc = spawn('node', [join(AUDITOR_DIR, 'src', 'index.js'), ...auditorArgs], {
      stdio: 'inherit',
      cwd: AUDITOR_DIR
    });

    // Wait for auditor to complete
    const exitCode = await new Promise((resolve) => {
      auditorProc.on('exit', (code) => {
        resolve(code || 0);
      });
    });

    // Cleanup and exit with auditor's exit code
    await cleanup();
    process.exit(exitCode);

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    await cleanup();
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

