import terminalKit from 'terminal-kit';

const { terminal: term } = terminalKit;

/**
 * Normalized key reader wrapping terminal-kit's input grabber.
 */
const createKeyReader = () => {
  term.grabInput({ mouse: false });

  const readKey = (): Promise<string> =>
    new Promise(resolve => {
      term.once('key', (name: string) => {
        const normalized = name === 'CTRL_C'
          ? 'ctrl-c'
          : name === 'UP'
            ? 'up'
            : name === 'DOWN'
              ? 'down'
              : name === 'LEFT'
                ? 'left'
                : name === 'RIGHT'
                  ? 'right'
                  : name === 'TAB'
                    ? 'tab'
                    : name === 'PAGE_UP'
                      ? 'pageup'
                      : name === 'PAGE_DOWN'
                        ? 'pagedown'
                        : name === ' '
                          ? 'space'
                          : name === 'ENTER'
                            ? 'enter'
                            : name === 'ESCAPE'
                              ? 'esc'
                              : name.toLowerCase();

        resolve(normalized);
      });
    });

  return {
    readKey,
    enable: () => term.grabInput({ mouse: false }),
    disable: () => term.grabInput(false),
    dispose: () => term.grabInput(false)
  };
};

/**
 * Inline query input prompt using terminal-kit's inputField.
 *
 * @param label
 * @param current
 */
const promptLine = async (label: string, current = ''): Promise<string> => {
  term(`\n  ^c◇^ ${label}: `);
  const input = await term.inputField({ default: current }).promise;

  term('\n');

  return input?.trim() || current;
};

export { createKeyReader, promptLine };
