import { stdin as input, stdout as output } from 'node:process';
import {
  clearTerminal,
  copyTextOsc52,
  enterAlternateScreen,
  leaveAlternateScreen
} from './client.helpers';
import { createKeyReader, promptLine } from './client.input';
import { type AgentlessClientSession, type ResourceLinkItem } from './client.transport';

interface SearchScreenState {
  query: string;
  results: ResourceLinkItem[];
  selectedIndex: number;
}

type ReaderAction = 'back' | 'quit' | 'raw';

const terminalWidth = (): number => output.columns ?? 80;

const readerBodyRows = (): number => Math.max(8, (output.rows ?? 24) - 10);

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

const renderSearchScreen = (state: SearchScreenState): void => {
  clearTerminal();
  const width = terminalWidth();
  const count = state.results.length;

  output.write(`\n  ◇ PatternFly Search: "${state.query}" (${count} matches found)\n\n`);

  if (!count) {
    output.write('  No matches yet. Press / to change query or q to quit.\n\n');
  }

  state.results.forEach((item, index) => {
    const marker = index === state.selectedIndex ? '◉' : '○';
    const badge = badgeForResult(item);
    const label = `${marker} ${badge} ${item.name}`;

    output.write(`  ${label.slice(0, width - 4)}\n`);
  });

  output.write('\n  [↑/↓ navigate, Enter view, / new query, q quit]\n');
};

const renderReaderScreen = (
  uri: string,
  titleLine: string,
  bodyLines: string[],
  scrollOffset: number,
  statusNote = ''
): void => {
  clearTerminal();
  const width = terminalWidth();
  const innerWidth = width - 4;
  const viewport = readerBodyRows();
  const visible = bodyLines.slice(scrollOffset, scrollOffset + viewport);
  const total = bodyLines.length;
  const scrollEnd = Math.min(total, scrollOffset + visible.length);
  const scrollLabel = total ? `lines ${scrollOffset + 1}-${scrollEnd} of ${total}` : 'empty';

  output.write(`\n  ┌── ${uri} ${'─'.repeat(Math.max(0, innerWidth - uri.length - 5))}\n`);
  wrapLines(titleLine, innerWidth).forEach(line => {
    output.write(`  │ ${line.padEnd(innerWidth)}\n`);
  });
  output.write(`  ├${'─'.repeat(innerWidth + 1)}\n`);

  if (!visible.length) {
    output.write(`  │ ${'(no content)'.padEnd(innerWidth)}\n`);
  }

  visible.forEach(line => {
    output.write(`  │ ${line.padEnd(innerWidth)}\n`);
  });

  output.write(`  └${'─'.repeat(innerWidth + 1)}\n`);
  output.write(`\n  ${scrollLabel}${statusNote ? `  ·  ${statusNote}` : ''}\n`);
  output.write('  [↑/↓ PgUp/PgDn scroll · Enter/b back · c copy · r raw · q quit]\n');
};

const promptForSearchQuery = async (keys: ReturnType<typeof createKeyReader>, current: string): Promise<string> => {
  leaveAlternateScreen();
  keys.disable();
  clearTerminal();

  const query = await promptLine('  ◇ PatternFly Search — enter query', current);

  enterAlternateScreen();
  keys.enable();

  return query;
};

/**
 * Run search-and-select screen until the user opens a result or quits.
 *
 * @param session - Connected MCP client session.
 * @param initialState - Query, results, and selection index.
 * @param keys - Shared TTY key reader for the interactive session.
 */
const runSearchScreen = async (
  session: AgentlessClientSession,
  initialState: SearchScreenState,
  keys: ReturnType<typeof createKeyReader>
): Promise<{ action: 'quit' } | { action: 'open'; uri: string; state: SearchScreenState }> => {
  const state: SearchScreenState = { ...initialState };

  if (!state.results.length && state.query) {
    state.results = await session.search(state.query);
    state.selectedIndex = 0;
  }

  for (;;) {
    renderSearchScreen(state);
    const key = await keys.readKey();

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
      state.query = await promptForSearchQuery(keys, state.query);

      if (!state.query) {
        continue;
      }

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
 * @param keys - Shared TTY key reader for the interactive session.
 */
const runReaderScreen = async (
  session: AgentlessClientSession,
  uri: string,
  keys: ReturnType<typeof createKeyReader>
): Promise<ReaderAction> => {
  const { text: body } = await session.readResource(uri);
  const titleLine = body.split('\n').find(line => line.trim().length)?.replace(/^#\s*/, '') ?? uri;
  const innerWidth = terminalWidth() - 4;
  const bodyLines = wrapLines(body, innerWidth);
  let scrollOffset = 0;
  let statusNote = '';

  const maxScroll = (): number => Math.max(0, bodyLines.length - readerBodyRows());

  for (;;) {
    renderReaderScreen(uri, titleLine, bodyLines, scrollOffset, statusNote);
    statusNote = '';
    const key = await keys.readKey();

    if (key === 'b' || key === 'esc' || key === 'enter') {
      return 'back';
    }

    if (key === 'q' || key === 'ctrl-c') {
      return 'quit';
    }

    if (key === 'up') {
      scrollOffset = Math.max(0, scrollOffset - 1);
      continue;
    }

    if (key === 'down') {
      scrollOffset = Math.min(maxScroll(), scrollOffset + 1);
      continue;
    }

    if (key === 'pageup') {
      scrollOffset = Math.max(0, scrollOffset - readerBodyRows());
      continue;
    }

    if (key === 'pagedown') {
      scrollOffset = Math.min(maxScroll(), scrollOffset + readerBodyRows());
      continue;
    }

    if (key === 'c') {
      const copiedAll = copyTextOsc52(body);

      statusNote = copiedAll ? 'Copied to clipboard' : 'Copied first 48k chars to clipboard';
      continue;
    }

    if (key === 'r') {
      leaveAlternateScreen();
      keys.dispose();
      output.write(`${body}\n`);

      return 'raw';
    }
  }
};

/**
 * Interactive two-screen search and read loop for TTY sessions.
 *
 * @param session - Connected MCP client session.
 * @param initialQuery - Optional initial search string (prompts when empty).
 */
const runInteractiveClient = async (
  session: AgentlessClientSession,
  initialQuery = ''
): Promise<void> => {
  if (!input.isTTY || !output.isTTY) {
    throw new Error('Interactive pf-client requires a TTY. Use `pf-client search <query> --json` for scripts.');
  }

  let query = initialQuery.trim();

  if (!query) {
    clearTerminal();
    query = await promptLine('  ◇ PatternFly Search — enter query');

    if (!query) {
      return;
    }
  }

  const keys = createKeyReader();

  enterAlternateScreen();
  keys.enable();

  let searchState: SearchScreenState = {
    query,
    results: await session.search(query),
    selectedIndex: 0
  };

  try {
    for (;;) {
      const searchOutcome = await runSearchScreen(session, searchState, keys);

      if (searchOutcome.action === 'quit') {
        break;
      }

      searchState = searchOutcome.state;
      const readerOutcome = await runReaderScreen(session, searchOutcome.uri, keys);

      if (readerOutcome === 'quit' || readerOutcome === 'raw') {
        break;
      }
    }
  } finally {
    keys.dispose();
    leaveAlternateScreen();
  }
};

export {
  runInteractiveClient,
  runReaderScreen,
  runSearchScreen,
  type SearchScreenState
};
