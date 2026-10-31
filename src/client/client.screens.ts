import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  clearTerminal,
  copyTextOsc52,
  enterAlternateScreen,
  leaveAlternateScreen
} from './client.helpers';
import { type AgentlessClientSession, type ResourceLinkItem } from './client.transport';

interface SearchScreenState {
  query: string;
  results: ResourceLinkItem[];
  selectedIndex: number;
}

type ReaderAction = 'back' | 'quit' | 'raw';

const terminalWidth = (): number => output.columns ?? 80;

const badgeForResult = (item: ResourceLinkItem): string => {
  if (item.uri.includes('/records/') || item.uri.startsWith('patternfly://records/')) {
    return '[Record]';
  }

  if (item.name.includes('JSON Schema')) {
    return '[Schema]';
  }

  if (item.name.includes('(Collection)')) {
    return '[Collection]';
  }

  return '[Doc]';
};

const wrapLines = (text: string, width: number): string[] => {
  const lines: string[] = [];

  text.split('\n').forEach(line => {
    if (line.length <= width) {
      lines.push(line);

      return;
    }

    let rest = line;

    while (rest.length > width) {
      lines.push(rest.slice(0, width));
      rest = rest.slice(width);
    }

    if (rest.length) {
      lines.push(rest);
    }
  });

  return lines;
};

const readKey = (): Promise<string> =>
  new Promise(resolve => {
    const onData = (chunk: Buffer) => {
      input.off('data', onData);
      const key = chunk.toString('utf8');

      if (key === '\u0003') {
        resolve('ctrl-c');

        return;
      }

      if (key === '\r' || key === '\n') {
        resolve('enter');

        return;
      }

      if (key === '\u001b[A') {
        resolve('up');

        return;
      }

      if (key === '\u001b[B') {
        resolve('down');

        return;
      }

      if (key === '\u001b') {
        resolve('esc');

        return;
      }

      resolve(key);
    };

    input.once('data', onData);
  });

const promptForQuery = async (current: string): Promise<string> => {
  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(`Search query [${current}]: `);

  rl.close();

  return answer.trim() || current;
};

const renderSearchScreen = (state: SearchScreenState): void => {
  clearTerminal();
  const width = terminalWidth();
  const count = state.results.length;

  output.write(`\n  ◇ PatternFly Search: "${state.query}" (${count} matches found)\n\n`);

  if (!count) {
    output.write('  No matches. Press / to search again or q to quit.\n');
  }

  state.results.forEach((item, index) => {
    const marker = index === state.selectedIndex ? '◉' : '○';
    const badge = badgeForResult(item);
    const label = `${marker} ${badge} ${item.name}`;

    output.write(`  ${label.slice(0, width - 4)}\n`);
  });

  output.write('\n  [↑/↓ navigate, Enter view, / filter, q quit]\n');
};

const renderReaderScreen = (uri: string, titleLine: string, body: string): void => {
  clearTerminal();
  const width = terminalWidth();
  const innerWidth = width - 4;

  output.write(`\n  ┌── ${uri} ${'─'.repeat(Math.max(0, innerWidth - uri.length - 5))}\n`);
  wrapLines(titleLine, innerWidth).forEach(line => {
    output.write(`  │ ${line.padEnd(innerWidth)}\n`);
  });
  output.write(`  ├${'─'.repeat(innerWidth + 1)}\n`);

  wrapLines(body, innerWidth).slice(0, Math.max(10, (output.rows ?? 24) - 8)).forEach(line => {
    output.write(`  │ ${line.padEnd(innerWidth)}\n`);
  });

  output.write(`  └${'─'.repeat(innerWidth + 1)}\n`);
  output.write('\n  [b] Back   [c] Copy   [r] Raw text   [q] Quit\n');
};

const withRawInput = async <T>(run: () => Promise<T>): Promise<T> => {
  const wasRaw = input.isRaw;

  input.setRawMode?.(true);
  input.resume();

  try {
    return await run();
  } finally {
    input.setRawMode?.(wasRaw ?? false);
    input.pause();
  }
};

/**
 * Run search-and-select screen until the user opens a result or quits.
 *
 * @param session - Connected MCP client session.
 * @param initialState - Query, results, and selection index.
 */
const runSearchScreen = async (
  session: AgentlessClientSession,
  initialState: SearchScreenState
): Promise<{ action: 'quit' } | { action: 'open'; uri: string; state: SearchScreenState }> => {
  const state: SearchScreenState = { ...initialState };

  if (!state.results.length && state.query) {
    state.results = await session.search(state.query);
    state.selectedIndex = 0;
  }

  // Interactive loop until quit or open
  for (;;) {
    renderSearchScreen(state);
    const key = await withRawInput(readKey);

    if (key === 'q' || key === 'ctrl-c') {
      return { action: 'quit' };
    }

    if (key === 'up') {
      state.selectedIndex = Math.max(0, state.selectedIndex - 1);
      continue;
    }

    if (key === 'down') {
      state.selectedIndex = Math.min(Math.max(0, state.results.length - 1), state.selectedIndex + 1);
      continue;
    }

    if (key === '/') {
      input.setRawMode?.(false);
      state.query = await promptForQuery(state.query);
      state.results = await session.search(state.query);
      state.selectedIndex = 0;
      continue;
    }

    if (key === 'enter') {
      const selected = state.results[state.selectedIndex];

      if (selected) {
        return {
          action: 'open',
          uri: selected.uri,
          state: { ...state }
        };
      }
    }
  }
};

/**
 * Show a single resource and handle reader shortcuts.
 *
 * @param session - Connected MCP client session.
 * @param uri - Resource URI to load.
 */
const runReaderScreen = async (
  session: AgentlessClientSession,
  uri: string
): Promise<ReaderAction> => {
  const body = await session.readResource(uri);
  const titleLine = body.split('\n').find(line => line.trim().length)?.replace(/^#\s*/, '') ?? uri;

  // Interactive loop until quit or open
  for (;;) {
    renderReaderScreen(uri, titleLine, body);
    const key = await withRawInput(readKey);

    if (key === 'b' || key === 'esc') {
      return 'back';
    }

    if (key === 'q' || key === 'ctrl-c') {
      return 'quit';
    }

    if (key === 'c') {
      copyTextOsc52(body);
      continue;
    }

    if (key === 'r') {
      leaveAlternateScreen();
      output.write(`${body}\n`);

      return 'raw';
    }
  }
};

/**
 * Interactive two-screen search and read loop for TTY sessions.
 *
 * @param session - Connected MCP client session.
 * @param initialQuery - Initial search string.
 */
const runInteractiveClient = async (
  session: AgentlessClientSession,
  initialQuery: string
): Promise<void> => {
  enterAlternateScreen();

  let searchState: SearchScreenState = {
    query: initialQuery,
    results: [],
    selectedIndex: 0
  };

  try {
    if (initialQuery) {
      searchState.results = await session.search(initialQuery);
    }

    for (;;) {
      const searchOutcome = await runSearchScreen(session, searchState);

      if (searchOutcome.action === 'quit') {
        break;
      }

      searchState = searchOutcome.state;
      const readerOutcome = await runReaderScreen(session, searchOutcome.uri);

      if (readerOutcome === 'quit' || readerOutcome === 'raw') {
        break;
      }
    }
  } finally {
    leaveAlternateScreen();
  }
};

export {
  runInteractiveClient,
  runReaderScreen,
  runSearchScreen,
  type SearchScreenState
};
