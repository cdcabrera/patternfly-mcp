import { Buffer } from 'node:buffer';

/**
 * Clear the terminal viewport (full reset).
 */
const clearTerminal = (): void => {
  process.stdout.write('\x1Bc');
};

/**
 * Switch to the terminal alternate screen buffer (restores on leave).
 */
const enterAlternateScreen = (): void => {
  process.stdout.write('\x1b[?1049h');
};

/**
 * Restore the primary screen buffer after alternate-screen use.
 */
const leaveAlternateScreen = (): void => {
  process.stdout.write('\x1b[?1049l');
};

/**
 * Copy plain text to the system clipboard via OSC-52 (supported in many modern terminals).
 *
 * @param text - UTF-8 string to place on the clipboard.
 * @returns Whether the full string was copied (false when truncated for terminal limits).
 */
const copyTextOsc52 = (text: string): boolean => {
  const OSC52_MAX_CHARS = 48_000;
  const payload = text.length > OSC52_MAX_CHARS ? text.slice(0, OSC52_MAX_CHARS) : text;
  const encoded = Buffer.from(payload, 'utf8').toString('base64');

  process.stdout.write(`\x1b]52;c;${encoded}\x07`);

  return payload.length === text.length;
};

export {
  clearTerminal,
  copyTextOsc52,
  enterAlternateScreen,
  leaveAlternateScreen
};
