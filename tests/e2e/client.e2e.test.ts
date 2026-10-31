import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startServer, type StdioTransportClient } from './utils/stdioTransportClient';

const execFileAsync = promisify(execFile);

describe('MCP server --client mode', () => {
  let CLIENT: StdioTransportClient;

  beforeAll(async () => {
    CLIENT = await startServer({
      args: ['--client']
    });
  });

  afterAll(async () => {
    if (CLIENT) {
      await CLIENT.close();
    }
  });

  it('should only expose searchPatternFly tool', async () => {
    const response = await CLIENT.send({
      method: 'tools/list',
      params: {}
    });
    const toolNames = (response?.result?.tools || []).map((tool: { name: string }) => tool.name);

    expect(toolNames).toEqual(['searchPatternFly']);
  });

  it('should return resource_link items for modal search', async () => {
    const response = await CLIENT.send({
      method: 'tools/call',
      params: {
        name: 'searchPatternFly',
        arguments: { query: 'modal' }
      }
    });

    const resources = (response?.result?.content || []).filter(
      (item: { type: string }) => item.type === 'resource_link'
    );

    expect(resources.length).toBeGreaterThan(0);

    const link = resources.find(
      (item: { uri: string; name: string }) =>
        item.uri.startsWith('patternfly://') && !item.name.includes('Collection')
    );

    expect(link).toBeDefined();

    const readResponse = await CLIENT.send({
      method: 'resources/read',
      params: { uri: link.uri }
    });

    expect(readResponse.result.contents[0].text).toBeDefined();
  });
});

describe('pf-client headless CLI', () => {
  it('should print JSON resource links for search --json', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      ['dist/cli.client.js', 'search', 'button', '--json'],
      { cwd: process.cwd(), env: process.env }
    );

    const parsed = JSON.parse(stdout.trim()) as { uri: string; name: string }[];

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some(item => item.uri.startsWith('patternfly://'))).toBe(true);
  });

  it('should print markdown for read subcommand', async () => {
    const { stdout: searchOut } = await execFileAsync(
      process.execPath,
      ['dist/cli.client.js', 'search', 'button', '--json'],
      { cwd: process.cwd(), env: process.env }
    );

    const links = JSON.parse(searchOut.trim()) as { uri: string }[];
    const uri = links.find(item => item.uri.startsWith('patternfly://docs/'))?.uri;

    expect(uri).toBeDefined();

    const { stdout: markdown } = await execFileAsync(
      process.execPath,
      ['dist/cli.client.js', 'read', uri as string],
      { cwd: process.cwd(), env: process.env }
    );

    expect(markdown.length).toBeGreaterThan(20);
  });
});
