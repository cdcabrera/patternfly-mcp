import readline from 'node:readline';
import { createInterface as createPromiseInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const resolveKeyToken = (_str: string, key: readline.Key): string => {
  if (key.ctrl && key.name === 'c') {
    return 'ctrl-c';
  }

  if (key.name === 'up') {
    return 'up';
  }

  if (key.name === 'down') {
    return 'down';
  }

  if (key.name === 'pageup') {
    return 'pageup';
  }

  if (key.name === 'pagedown') {
    return 'pagedown';
  }

  if (key.name === 'space' || _str === ' ') {
    return 'pagedown';
  }

  if (key.name === 'return') {
    return 'enter';
  }

  if (key.name === 'escape') {
    return 'esc';
  }

  if (key.name === 'backspace') {
    return 'backspace';
  }

  if (_str.length === 1) {
    return _str;
  }

  if (key.name && /^[a-z0-9]$/i.test(key.name)) {
    return key.name;
  }

  return 'other';
};

/**
 * Create a TTY key reader using Node readline keypress events (handles arrow keys reliably).
 */
const createKeyReader = () => {
  readline.emitKeypressEvents(input);

  let listening = false;
  let pending: ((key: string) => void) | null = null;

  const onKeypress = (_str: string, key: readline.Key) => {
    if (!listening || !pending) {
      return;
    }

    const resolve = pending;

    pending = null;
    resolve(resolveKeyToken(_str, key));
  };

  input.on('keypress', onKeypress);

  const enable = (): void => {
    if (!input.isTTY) {
      return;
    }

    input.setRawMode?.(true);
    input.resume();
    listening = true;
  };

  const disable = (): void => {
    listening = false;
    pending = null;
    input.setRawMode?.(false);
  };

  const dispose = (): void => {
    disable();
    input.off('keypress', onKeypress);
    input.pause();
  };

  const readKey = (): Promise<string> =>
    new Promise(resolve => {
      pending = resolve;
    });

  return { readKey, enable, disable, dispose };
};

/**
 * Prompt for a search query on the primary screen (line-based input).
 *
 * @param label - Prompt label shown to the user.
 * @param current - Optional default query text.
 */
const promptLine = async (label: string, current = ''): Promise<string> => {
  const rl = createPromiseInterface({ input, output, terminal: true });
  const suffix = current ? ` [${current}]` : '';
  const answer = await rl.question(`${label}${suffix}: `);

  rl.close();

  return answer.trim() || current;
};

export { createKeyReader, promptLine, resolveKeyToken };
