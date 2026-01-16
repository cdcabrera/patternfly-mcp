import { start } from '@patternfly/patternfly-mcp';

async function main() {
  // Start the server with default (stdio) transport
  const server = await start();

  // Optional: Listen for server logs - Avoid using console.log and info they pollute STDOUT.
  server.onLog((event) => {
    if (event.level !== 'debug') {
      console.warn(`[${event.level}] ${event.msg}`);
    }
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}

main().catch(console.error);
