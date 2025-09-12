#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { runServer, startDaemon, stopDaemon, statusDaemon } from './server.js';
import { resolvePaths, setupFileLogging } from './helpers.js';

const argv  = await yargs(hideBin(process.argv))
  .scriptName('pf-mcp')
  .usage('Usage: $0 [options]')
  .option('status', { type: 'boolean', describe: 'Check if the pf-mcp daemon is running', default: false })
  .option('daemon', { type: 'boolean', describe: 'Run the server in the background (daemonize)', default: false })
  .option('stop', { type: 'boolean', describe: 'Stop a running daemon (reads PID file)', default: false })
  .option('log', { type: 'string', describe: 'Path to log file for daemon mode' })
  .option('pid', { type: 'string', describe: 'Path to PID file for daemon mode' })
  .option('child', { type: 'boolean', describe: 'Internal flag for daemon child process', hidden: true, default: false })
  .version('1.2.0')
  .help()
  .parse();

const start = async () => {
  // Child process branch: spawned by startDaemon. Configure logging and run server.
  if (argv.child) {
    const { logFile } = resolvePaths(argv.log);
    setupFileLogging(logFile);

    // Keep the event loop alive in daemon mode even if stdio closes.
    const keepAlive = setInterval(() => {}, 60_000);

    // Allow graceful shutdown when stopDaemon sends SIGTERM.
    process.on('SIGTERM', () => {
      clearInterval(keepAlive);
      // Give the server.ts SIGTERM handler a chance to run too; then exit.
      setTimeout(() => process.exit(0), 1000);
    });

    runServer().catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
    return;
  }

  if (argv.status) {
    const res = statusDaemon(argv.pid);
    if (res.running) {
      console.log(`pf-mcp is running (PID ${res.pid}).`);
      return;
    } else {
      console.log('pf-mcp is not running.');
      process.exit(1);
    }
  }

  if (argv.stop) {
    stopDaemon(argv.pid);
    return;
  }

  if (argv.daemon) {
    await startDaemon(argv.log, argv.pid);
    return;
  }

  if (process.env.NODE_ENV === 'test') {
    process.stdout.write(JSON.stringify(argv));
  } else {
    runServer().catch((error) => {
      console.error('Failed to start server:', error);
      process.exit(1);
    });
  }
};

start();
