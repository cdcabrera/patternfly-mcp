import { materializeResourceText, parseResourceLinks, type ResourceLinkItem } from '../client';

describe('materializeResourceText', () => {
  it('joins multiple text contents', () => {
    expect(materializeResourceText([
      { uri: 'a', mimeType: 'text/markdown', text: 'Part one' },
      { uri: 'b', mimeType: 'text/markdown', text: 'Part two' }
    ])).toBe('Part one\n\n---\n\nPart two');
  });

  it('returns guidance when no text is present', () => {
    expect(materializeResourceText([])).toContain('No readable text');
  });
});

describe('parseResourceLinks', () => {
  it('maps resource_link content entries', () => {
    const links: ResourceLinkItem[] = parseResourceLinks({
      content: [
        { type: 'text', text: 'summary' },
        {
          type: 'resource_link',
          uri: 'patternfly://records/abc',
          name: 'Modal — Docs',
          description: 'Modal documentation',
          groupId: 'modal',
          primaryCollection: 'patternfly-docs'
        } as never
      ]
    });

    expect(links).toEqual([
      {
        uri: 'patternfly://records/abc',
        name: 'Modal — Docs',
        description: 'Modal documentation',
        groupId: 'modal',
        primaryCollection: 'patternfly-docs'
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
const mockChannelClose = jest.fn();
const mockServerStop = jest.fn();
const mockServerIsRunning = jest.fn().mockReturnValue(true);

const mockClientChannel = { close: mockChannelClose };
const mockServerChannel = { close: jest.fn() };

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    callTool: mockCallTool,
    readResource: mockReadResource,
    close: mockClientClose
  }))
}));

jest.mock('../mcpSdk', () => ({
  createMcpChannel: jest.fn().mockImplementation(() => [mockClientChannel, mockServerChannel]),
  McpClient: jest.requireMock('@modelcontextprotocol/sdk/client/index.js').Client
}));

jest.mock('../server', () => ({
  runServer: jest.fn().mockImplementation(async () => ({
    stop: mockServerStop,
    isRunning: mockServerIsRunning,
    getStats: jest.fn(),
    onLog: jest.fn()
  }))
}));

describe('AgentlessClientSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes in-process server with searchPatternFly and connects via mcpChannel', async () => {
    const { runServer } = await import('../server');
    const { runClient } = await import('../client');
    const { searchPatternFlyTool } = await import('../tool.searchPatternFly');

    const session = await runClient({ name: 'test-client' } as never);

    await session.connect();

    expect(runServer).toHaveBeenCalledWith(
      expect.objectContaining({
        client: true,
        name: 'test-client'
      }),
      expect.objectContaining({
        tools: [searchPatternFlyTool],
        enableSigint: false,
        allowProcessExit: false,
        mcpChannel: mockServerChannel
      })
    );
    expect(mockConnect).toHaveBeenCalledWith(mockClientChannel);
  });

  it('calls searchPatternFly and maps links', async () => {
    mockCallTool.mockResolvedValue({
      content: [{
        type: 'resource_link',
        uri: 'patternfly://docs/button',
        name: 'Button'
      }]
    });

    const { runClient } = await import('../client');
    const session = await runClient();

    const results = await session.search('button');

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'searchPatternFly',
      arguments: { query: 'button' }
    });
    expect(results[0]?.uri).toBe('patternfly://docs/button');
  });

  it('passes collection filter when provided to search', async () => {
    mockCallTool.mockResolvedValue({
      content: [{
        type: 'resource_link',
        uri: 'patternfly://records/modal-doc',
        name: 'Modal — Docs',
        groupId: 'modal',
        primaryCollection: 'patternfly-docs'
      }]
    });

    const { runClient } = await import('../client');
    const session = await runClient();

    const results = await session.search('modal', 'patternfly-docs');

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'searchPatternFly',
      arguments: { query: 'modal', collection: 'patternfly-docs' }
    });
    expect(results[0]?.groupId).toBe('modal');
    expect(results[0]?.primaryCollection).toBe('patternfly-docs');
  });

  it('extracts groupId, recordId, and primaryCollection from _meta payload', async () => {
    mockCallTool.mockResolvedValueOnce({
      content: [
        {
          type: 'resource_link',
          uri: 'patternfly://docs/modal-acc',
          name: 'Modal - Accessibility (v6)',
          _meta: {
            recordId: 'modal-acc-id',
            groupId: 'modal-hash-123',
            primaryCollection: 'patternfly-docs'
          }
        }
      ]
    });

    const { runClient } = await import('../client');
    const session = await runClient();

    await session.connect();
    const items = await session.search('modal');

    expect(items).toHaveLength(1);
    expect(items[0]?.recordId).toBe('modal-acc-id');
    expect(items[0]?.groupId).toBe('modal-hash-123');
    expect(items[0]?.primaryCollection).toBe('patternfly-docs');
  });

  it('reads resource text from the first content item', async () => {
    mockReadResource.mockResolvedValue({
      contents: [{ uri: 'patternfly://docs/button', text: '# Button\n\nDocs body' }]
    });

    const { runClient } = await import('../client');
    const session = await runClient();

    await expect(session.readResource('patternfly://docs/button')).resolves.toEqual({
      text: '# Button\n\nDocs body',
      truncated: false
    });
  });
});
