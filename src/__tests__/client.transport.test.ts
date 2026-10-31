import { parseResourceLinks, type ResourceLinkItem } from '../client/client.transport';

describe('parseResourceLinks', () => {
  it('maps resource_link content entries', () => {
    const links: ResourceLinkItem[] = parseResourceLinks({
      content: [
        { type: 'text', text: 'summary' },
        {
          type: 'resource_link',
          uri: 'patternfly://records/abc',
          name: 'Modal — Docs',
          description: 'Modal documentation'
        }
      ]
    });

    expect(links).toEqual([
      {
        uri: 'patternfly://records/abc',
        name: 'Modal — Docs',
        description: 'Modal documentation'
      }
    ]);
  });

  it('returns an empty list when content is missing', () => {
    expect(parseResourceLinks({ content: [] })).toEqual([]);
  });
});

const mockConnect = jest.fn();
const mockCallTool = jest.fn();
const mockReadResource = jest.fn();
const mockClientClose = jest.fn();
const mockTransportClose = jest.fn();

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    callTool: mockCallTool,
    readResource: mockReadResource,
    close: mockClientClose
  }))
}));

jest.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: jest.fn().mockImplementation(() => ({
    close: mockTransportClose
  }))
}));

describe('AgentlessClientSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes --client when spawning the server CLI', async () => {
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const { AgentlessClientSession } = await import('../client/client.transport');

    const session = new AgentlessClientSession(
      { command: 'node', args: ['/tmp/pf-cli.js'] },
      ['--log-stderr']
    );

    await session.connect();

    expect(StdioClientTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'node',
        args: ['/tmp/pf-cli.js', '--client', '--log-stderr'],
        stderr: 'pipe'
      })
    );
    expect(mockConnect).toHaveBeenCalled();
  });

  it('calls searchPatternFly and maps links', async () => {
    mockCallTool.mockResolvedValue({
      content: [{
        type: 'resource_link',
        uri: 'patternfly://docs/button',
        name: 'Button'
      }]
    });

    const { AgentlessClientSession } = await import('../client/client.transport');
    const session = new AgentlessClientSession({ command: 'node', args: ['/tmp/pf-cli.js'] });

    const results = await session.search('button');

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'searchPatternFly',
      arguments: { query: 'button' }
    });
    expect(results[0]?.uri).toBe('patternfly://docs/button');
  });

  it('reads resource text from the first content item', async () => {
    mockReadResource.mockResolvedValue({
      contents: [{ uri: 'patternfly://docs/button', text: '# Button\n\nDocs body' }]
    });

    const { AgentlessClientSession } = await import('../client/client.transport');
    const session = new AgentlessClientSession({ command: 'node', args: ['/tmp/pf-cli.js'] });

    await expect(session.readResource('patternfly://docs/button')).resolves.toBe('# Button\n\nDocs body');
  });
});
