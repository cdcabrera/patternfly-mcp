import readline from 'node:readline';
import { createInterface as createPromiseInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

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

    if (key.ctrl && key.name === 'c') {
      resolve('ctrl-c');

      return;
    }

    if (key.name === 'up') {
      resolve('up');

      return;
    }

    if (key.name === 'down') {
      resolve('down');

      return;
    }

    if (key.name === 'return') {
      resolve('enter');

      return;
    }

    if (key.name === 'escape') {
      resolve('esc');

      return;
    }

    if (key.name === 'backspace') {
      resolve('backspace');

      return;
    }

    if (_str.length === 1) {
      resolve(_str);

      return;
    }

    resolve('other');
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

export { createKeyReader, promptLine };
