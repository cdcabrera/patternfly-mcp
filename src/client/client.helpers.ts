import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';

interface ClipboardCopyResult {
  ok: boolean;
  message: string;
}

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
 * Copy via OSC-52 (terminal clipboard integration).
 *
 * @param text - UTF-8 string to place on the clipboard.
 */
const copyTextOsc52 = (text: string): void => {
  const encoded = Buffer.from(text, 'utf8').toString('base64');

  process.stdout.write(`\x1b]52;c;${encoded}\x07`);
};

/**
 * Copy plain text to the system clipboard (pbcopy / wl-copy / xclip, then OSC-52).
 *
 * @param text - UTF-8 content to copy.
 */
const copyTextToClipboard = (text: string): ClipboardCopyResult => {
  if (process.platform === 'darwin') {
    const result = spawnSync('pbcopy', { input: text, encoding: 'utf-8' });

    if (result.status === 0 && !result.error) {
      return { ok: true, message: 'Copied full document to clipboard' };
    }
  }

  if (process.platform === 'linux') {
    if (process.env.WAYLAND_DISPLAY) {
      const result = spawnSync('wl-copy', { input: text, encoding: 'utf-8' });

      if (result.status === 0 && !result.error) {
        return { ok: true, message: 'Copied full document to clipboard' };
      }
    }

    const xclip = spawnSync('xclip', ['-selection', 'clipboard'], { input: text, encoding: 'utf-8' });

    if (xclip.status === 0 && !xclip.error) {
      return { ok: true, message: 'Copied full document to clipboard' };
    }
  }

  try {
    copyTextOsc52(text);

    return {
      ok: true,
      message: 'Sent to terminal clipboard (OSC-52). If nothing pasted, enable OSC-52 or use [r] to save a file.'
    };
  } catch {
    return {
      ok: false,
      message: 'Copy failed. Use [r] to save a .md file in this directory.'
    };
  }
};

export {
  clearTerminal,
  copyTextOsc52,
  copyTextToClipboard,
  enterAlternateScreen,
  leaveAlternateScreen,
  type ClipboardCopyResult
};
