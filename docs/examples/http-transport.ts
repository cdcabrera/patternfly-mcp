import { start } from '@patternfly/patternfly-mcp';

async function main() {
  // Start the server in HTTP transport mode
  const server = await start({
    isHttp: true,
    http: {
      port: 3000,
      host: '127.0.0.1',
      allowedOrigins: ['https://my-app.com'],
      allowedHosts: ['localhost', '127.0.0.1']
    }
  });

  // Avoid using console.log and info they pollute STDOUT.
  console.warn('PatternFly MCP Server started in HTTP mode on port 3000.');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });
}

main().catch(console.error);
