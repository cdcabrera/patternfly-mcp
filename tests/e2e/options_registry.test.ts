import { startServer, type StdioTransportClient } from './utils/stdioTransportClient';

describe('Options Registry E2E', () => {
  let CLIENT: StdioTransportClient;

  afterEach(async () => {
    if (CLIENT) {
      await CLIENT.close();
    }
  });

  it('should detect log messages for new options when enabled via CLI', async () => {
    CLIENT = await startServer({
      args: [
        '--regular-option',
        'foo',
        '--experimental-no-default-option',
        'bar',
        '--experimental-with-default-option',
        'baz',
        '--log-stderr'
      ]
    });

    // Wait for the server to start and emit logs
    await new Promise(resolve => setTimeout(resolve, 2000));

    const logs = CLIENT.stderrLogs().join('\n');

    expect(logs).toContain('Regular option is enabled');
    expect(logs).toContain('Experimental no default option is enabled');
    expect(logs).toContain('Experimental with default option is enabled');

    // Verify standard experimental warnings are also present
    expect(logs).toContain('Enabled experimental options! Options are subject to change, use at your own risk!');
    expect(logs).toContain('Enabled experimental option: noDefaultOption');
    expect(logs).toContain('Enabled experimental option: withDefaultOption');
  });

  it('should NOT detect log messages when options are NOT set', async () => {
    CLIENT = await startServer({
      args: ['--log-stderr']
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const logs = CLIENT.stderrLogs().join('\n');

    expect(logs).not.toContain('Regular option is enabled');
    expect(logs).not.toContain('Experimental no default option is enabled');
    expect(logs).not.toContain('Experimental with default option is enabled');
  });
});
