import { isClipboardAvailable } from '../client/client.helpers';

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
