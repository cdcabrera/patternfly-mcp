#!/usr/bin/env node

import { AgentlessClientSession } from './client/client.transport';
import { runInteractiveClient } from './client/client.screens';

const SERVER_VALUE_FLAGS = new Set([
  '--log-level',
  '--mode',
  '--port',
  '--host',
  '--plugin-isolation',
  '--allowed-origins',
  '--allowed-hosts',
  '--tool'
]);

const printUsage = (): void => {
  console.error(`Usage:
  pf-client [query]                 Interactive search (TTY) or JSON results (pipe)
  pf-client search <query> --json Headless JSON resource links
  pf-client read <uri>              Headless markdown for one resource

  npm run start -- --client [query] Same as pf-client when run in a terminal`);
};

/**
 * Split argv from the main CLI into pf-client args vs flags forwarded to the spawned server.
 *
 * @param argv - Raw process argv slice (may include \`--client\`).
 */
const splitServerClientArgv = (argv: string[]): { clientArgv: string[]; serverExtraArgs: string[] } => {
  const filtered = argv.filter(token => token !== '--client');

  if (filtered[0] === 'search' || filtered[0] === 'read') {
    return { clientArgv: filtered, serverExtraArgs: [] };
  }

  const serverExtraArgs: string[] = [];
  const clientArgv: string[] = [];

  for (let index = 0; index < filtered.length; index += 1) {
    const token = filtered[index]!;

    if (!token.startsWith('--')) {
      clientArgv.push(token);
      continue;
    }

    if (token === '--json' || token === '--help' || token === '-h') {
      clientArgv.push(token);
      continue;
    }

    serverExtraArgs.push(token);

    if (SERVER_VALUE_FLAGS.has(token)) {
      const value = filtered[index + 1];

      if (value && !value.startsWith('--')) {
        serverExtraArgs.push(value);
        index += 1;
      }
    }
  }

  return { clientArgv, serverExtraArgs };
};

/**
 * Run the agentless pf-client (interactive TTY or headless search/read).
 *
 * @param argv - Client arguments (query, search, read, flags).
 * @param settings - Optional settings for the child MCP server process.
 * @param settings.serverExtraArgs - CLI flags forwarded to the spawned server (e.g. `--log-stderr`).
 */
const runPfClient = async (
  argv: string[] = process.argv.slice(2),
  { serverExtraArgs = [] }: { serverExtraArgs?: string[] } = {}
): Promise<void> => {
  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const session = new AgentlessClientSession(undefined, serverExtraArgs);

  await session.connect();

  try {
    if (argv[0] === 'search') {
      const query = argv[1];
      const asJson = argv.includes('--json');

      if (!query) {
        printUsage();
        process.exit(1);
      }

      const results = await session.search(query);

      if (asJson || !process.stdout.isTTY) {
        process.stdout.write(`${JSON.stringify(results)}\n`);
      } else {
        results.forEach(item => {
          process.stdout.write(`${item.uri}\t${item.name}\n`);
        });
      }

      return;
    }

    if (argv[0] === 'read') {
      const uri = argv[1];

      if (!uri) {
        printUsage();
        process.exit(1);
      }

      const { text: markdown } = await session.readResource(uri);

      process.stdout.write(`${markdown}\n`);

      return;
    }

    const initialQuery = argv.filter(token => !token.startsWith('-')).join(' ').trim();

    if (process.stdout.isTTY && process.stdin.isTTY) {
      await runInteractiveClient(session, initialQuery);

      return;
    }

    if (!initialQuery) {
      printUsage();
      process.exit(1);
    }

    const results = await session.search(initialQuery);

    process.stdout.write(`${JSON.stringify(results)}\n`);
  } finally {
    await session.close();
  }
};

const isCliClientEntry = (): boolean => {
  const entry = process.argv[1];

  return Boolean(entry && (entry.endsWith('cli.client.ts') || entry.endsWith('cli.client.js')));
};

if (isCliClientEntry()) {
  runPfClient().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

export { runPfClient, splitServerClientArgv };
