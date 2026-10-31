import { isClipboardAvailable, prepareReaderDisplay } from '../client.helpers';

describe('prepareReaderDisplay', () => {
  it('uses the first markdown heading for the title and strips provenance', () => {
    const raw = [
      '<!-- mcp:provenance id="af066c0c" groupId="40b815b1" -->',
      '',
      '# Documentation for Component Groups Close Button - Examples (v6)',
      '',
      'Body paragraph.'
    ].join('\n');

    const { titleLine, body } = prepareReaderDisplay({ fullText: raw, uri: 'patternfly://docs/x' });

    expect(titleLine).toBe('Documentation for Component Groups Close Button - Examples (v6)');
    expect(body).not.toContain('mcp:provenance');
    expect(body).not.toContain('# Documentation for Component Groups');
    expect(body).toContain('Body paragraph.');
  });
});

describe('isClipboardAvailable', () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it('returns false when PF_CLIENT_CLIPBOARD=0', () => {
    process.env.PF_CLIENT_CLIPBOARD = '0';
    delete process.env.CI;

    expect(isClipboardAvailable()).toBe(false);
  });

  it('returns true when PF_CLIENT_CLIPBOARD=1 even in CI', () => {
    process.env.PF_CLIENT_CLIPBOARD = '1';
    process.env.CI = 'true';

    expect(isClipboardAvailable()).toBe(true);
  });

  it('returns false in CI without override', () => {
    delete process.env.PF_CLIENT_CLIPBOARD;
    process.env.CI = 'true';

    expect(isClipboardAvailable()).toBe(false);
  });

  it('returns false on headless Linux', () => {
    delete process.env.PF_CLIENT_CLIPBOARD;
    delete process.env.CI;
    delete process.env.DISPLAY;
    delete process.env.WAYLAND_DISPLAY;

    const platform = Object.getOwnPropertyDescriptor(process, 'platform');

    Object.defineProperty(process, 'platform', { value: 'linux' });

    expect(isClipboardAvailable()).toBe(false);

    if (platform) {
      Object.defineProperty(process, 'platform', platform);
    }
  });
});
