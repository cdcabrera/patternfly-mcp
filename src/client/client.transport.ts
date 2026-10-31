import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface ResourceLinkItem {
  uri: string;
  name: string;
  description?: string;
}

const isResourceLinkContent = (
  item: CallToolResult['content'] extends (infer U)[] | undefined ? U : never
): item is { type: 'resource_link'; uri: string; name: string; description?: string } =>
  typeof item === 'object' &&
  item !== null &&
  (item as { type?: string }).type === 'resource_link' &&
  typeof (item as { uri?: string }).uri === 'string' &&
  typeof (item as { name?: string }).name === 'string';

const parseResourceLinks = (result: CallToolResult): ResourceLinkItem[] => {
  if (!result.content?.length) {
    return [];
  }

  return result.content.filter(isResourceLinkContent).map(item => ({
    uri: item.uri,
    name: item.name,
    ...(item.description !== undefined ? { description: item.description } : {})
  }));
};

/**
 * Resolve the built server CLI path for local dev (tsx) and packaged `dist/` layouts.
 */
const resolveDefaultServerPath = (): string => {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(moduleDir, '..', 'cli.js'),
    join(moduleDir, '..', '..', 'dist', 'cli.js'),
    join(process.cwd(), 'dist', 'cli.js')
  ];

  return candidates.find(candidate => existsSync(candidate)) ?? join(process.cwd(), 'dist', 'cli.js');
};

/**
 * MCP stdio client session for agentless search and resource reads.
 */
class AgentlessClientSession {
  private client: Client;
  private transport: StdioClientTransport;

  /**
   * @param serverPath - Path to the built PatternFly MCP server CLI.
   * @param extraArgs - Additional server CLI arguments.
   */
  constructor(serverPath: string = resolveDefaultServerPath(), extraArgs: string[] = []) {
    this.transport = new StdioClientTransport({
      command: 'node',
      args: [serverPath, '--client', ...extraArgs],
      stderr: 'pipe'
    });

    this.client = new Client(
      { name: 'pf-mcp-agentless-client', version: '1.0.0' },
      { capabilities: {} }
    );
  }

  /** Connect to the spawned MCP server over stdio. */
  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  /**
   * Run `searchPatternFly` and return resource link entries from the tool result.
   *
   * @param query - Search query passed to the server tool.
   */
  async search(query: string): Promise<ResourceLinkItem[]> {
    const result = await this.client.callTool({
      name: 'searchPatternFly',
      arguments: { query }
    }) as CallToolResult;

    return parseResourceLinks(result);
  }

  /**
   * Read markdown (or text) for a PatternFly resource URI.
   *
   * @param uri - MCP resource URI to read.
   */
  async readResource(uri: string): Promise<string> {
    const result = await this.client.readResource({ uri });
    const content = result.contents?.[0];

    return content && 'text' in content && typeof content.text === 'string' ? content.text : '';
  }

  /** Close the MCP session and child server process. */
  async close(): Promise<void> {
    await this.client.close();
    await this.transport.close();
  }
}

export {
  AgentlessClientSession,
  parseResourceLinks,
  resolveDefaultServerPath,
  type ResourceLinkItem
};
