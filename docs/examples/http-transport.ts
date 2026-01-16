/**
 * HTTP Transport Example
 * 
 * This example demonstrates how to start the PatternFly MCP Server
 * with HTTP transport and security configuration.
 */

import { start } from '@patternfly/patternfly-mcp';

async function main() {
  console.log('Starting PatternFly MCP Server with HTTP transport...');

  // Start server with HTTP transport
  const server = await start({
    http: {
      port: 8080,
      host: '127.0.0.1',
      allowedOrigins: ['https://app.example.com'],
      allowedHosts: ['localhost', '127.0.0.1']
    },
    logging: {
      stderr: true,
      level: 'info'
    }
  });

  console.log('Server started on http://127.0.0.1:8080');
  console.log(`Server is running: ${server.isRunning()}`);

  // Optional: Listen to server logs
  server.onLog((event) => {
    console.log(`[${event.level.toUpperCase()}] ${event.msg || ''}`);
  });

  // Get server statistics
  const stats = await server.getStats();
  console.log('Server stats:', stats);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down server...');
    await server.stop();
    console.log('Server stopped.');
    process.exit(0);
  });

  console.log('Server is running. Press Ctrl+C to stop.');
  console.log('Connect to: http://127.0.0.1:8080');
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
