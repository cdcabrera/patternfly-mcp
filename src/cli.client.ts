#!/usr/bin/env node

import { AgentlessClientSession } from './client/client.transport';
import { runInteractiveClient } from './client/client.screens';

const printUsage = (): void => {
  console.error(`Usage:
  pf-client [query]                 Interactive search (TTY) or JSON results (pipe)
  pf-client search <query> --json Headless JSON resource links
  pf-client read <uri>              Headless markdown for one resource`);
};

const run = async (): Promise<void> => {
  const argv = process.argv.slice(2);

  if (argv.includes('--help') || argv.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const session = new AgentlessClientSession();

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

      const markdown = await session.readResource(uri);

      process.stdout.write(`${markdown}\n`);

      return;
    }

    const initialQuery = argv.filter(token => !token.startsWith('-')).join(' ').trim();

    if (process.stdout.isTTY) {
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

run().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
