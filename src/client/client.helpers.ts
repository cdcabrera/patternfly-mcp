import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

interface ClipboardCopyResult {
  ok: boolean;
  message: string;
}

/**
 * Best-effort detection of OCI/container runtimes (Docker, Podman, etc.).
 */
const isRunningInContainer = (): boolean => {
  if (existsSync('/.dockerenv')) {
    return true;
  }

  try {
    const cgroup = readFileSync('/proc/1/cgroup', 'utf8');

    return /docker|podman|containerd|kubepods|libpod/i.test(cgroup);
  } catch {
    return false;
  }
};

/**
 * Whether the interactive reader should offer clipboard copy (`c`).
 *
 * Uses lightweight OS/environment checks at startup (no clipboard probe write).
 * Override with `PF_CLIENT_CLIPBOARD=0` or `PF_CLIENT_CLIPBOARD=1`.
 */
const isClipboardAvailable = (): boolean => {
  const override = process.env.PF_CLIENT_CLIPBOARD?.trim().toLowerCase();

  if (override === '0' || override === 'false' || override === 'no') {
    return false;
  }

  if (override === '1' || override === 'true' || override === 'yes') {
    return true;
  }

  if (process.env.CI) {
    return false;
  }

  if (isRunningInContainer()) {
    return false;
  }

  if (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return false;
  }

  if (process.platform === 'darwin' || process.platform === 'win32') {
    return true;
  }

  if (process.platform === 'linux') {
    return true;
  }

  return false;
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

const MCP_PROVENANCE_LINE = /^\s*<!--\s*mcp:provenance[\s\S]*?-->\s*$/i;

/**
 * Split MCP resource markdown into a title bar label and scrollable body.
 *
 * Strips `mcp:provenance` HTML comments and avoids repeating the first `#` heading in the body.
 *
 * @param fullText - Raw markdown from `readResource`.
 * @param uri - Resource URI fallback title.
 */
const prepareReaderDisplay = (fullText: string, uri: string): { titleLine: string; body: string } => {
  const lines = fullText.split('\n');
  const withoutProvenance = lines.filter(line => !MCP_PROVENANCE_LINE.test(line));
  const headingIndex = withoutProvenance.findIndex(line => /^#\s+/.test(line.trim()));

  if (headingIndex >= 0) {
    const heading = withoutProvenance[headingIndex] ?? '';
    const titleLine = heading.replace(/^#\s+/, '').trim();
    const bodyLines = [
      ...withoutProvenance.slice(0, headingIndex),
      ...withoutProvenance.slice(headingIndex + 1)
    ];

    return {
      titleLine,
      body: bodyLines.join('\n').replace(/^\n+/, '').trimEnd()
    };
  }

  const firstLine = withoutProvenance.find(line => line.trim().length)?.trim();

  return {
    titleLine: firstLine ?? uri,
    body: withoutProvenance.join('\n').replace(/^\n+/, '').trimEnd()
  };
};

export {
  copyTextOsc52,
  copyTextToClipboard,
  isClipboardAvailable,
  prepareReaderDisplay,
  type ClipboardCopyResult
};
