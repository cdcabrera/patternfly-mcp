/**
 * Basic Usage Example
 * 
 * This example demonstrates how to start the PatternFly MCP Server
 * with default stdio transport.
 */

import { start } from '@patternfly/patternfly-mcp';

async function main() {
  console.log('Starting PatternFly MCP Server...');

  // Start server with default stdio transport
  const server = await start();

  console.log('Server started successfully!');
  console.log(`Server is running: ${server.isRunning()}`);

  // Optional: Listen to server logs
  server.onLog((event) => {
    if (event.level !== 'debug') {
      console.log(`[${event.level.toUpperCase()}] ${event.msg || ''}`);
    }
  });

  // Graceful shutdown on SIGINT
  process.on('SIGINT', async () => {
    console.log('\nShutting down server...');
    await server.stop();
    console.log('Server stopped.');
    process.exit(0);
  });

  // Keep process alive
  console.log('Server is running. Press Ctrl+C to stop.');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
