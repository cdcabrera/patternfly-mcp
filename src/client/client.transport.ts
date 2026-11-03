import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js';

interface ResourceLinkItem {
  uri: string;
  name: string;
  description?: string | undefined;
  groupId?: string | undefined;
  primaryCollection?: string | undefined;
}

interface ResourceReadResult {
  text: string;
  truncated: boolean;
}

const MAX_TERMINAL_DISPLAY_CHARS = 512_000;

interface ServerSpawnSpec {
  command: string;
  args: string[];
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

  return result.content.filter(isResourceLinkContent).map(item => {
    const meta = (item as { _meta?: Record<string, unknown> })._meta;

    const groupId =
      (typeof meta?.groupId === 'string' && meta.groupId) ||
      (typeof meta?.['patternfly.org/groupId'] === 'string' && meta['patternfly.org/groupId']) ||
      (typeof (item as any).groupId === 'string' && (item as any).groupId) ||
      undefined;

    const primaryCollection =
      (typeof meta?.primaryCollection === 'string' && meta.primaryCollection) ||
      (typeof meta?.['patternfly.org/primaryCollection'] === 'string' && meta['patternfly.org/primaryCollection']) ||
      (typeof (item as any).primaryCollection === 'string' && (item as any).primaryCollection) ||
      undefined;

    return {
      uri: item.uri,
      name: item.name,
      ...(groupId ? { groupId } : {}),
      ...(primaryCollection ? { primaryCollection } : {}),
      ...(item.description !== undefined ? { description: item.description } : {})
    };
  });
};

const materializeResourceText = (contents: NonNullable<Awaited<ReturnType<Client['readResource']>>['contents']>): string => {
  const parts: string[] = [];

  for (const content of contents) {
    if ('text' in content && typeof content.text === 'string') {
      parts.push(content.text);
      continue;
    }

    if ('blob' in content && typeof content.blob === 'string') {
      try {
        parts.push(Buffer.from(content.blob, 'base64').toString('utf8'));
      } catch {
        parts.push('[Binary resource blob — use `pf-client read <uri>` in a shell to redirect output to a file.]');
      }
    }
  }

  const joined = parts.join('\n\n---\n\n').trim();

  if (joined.length) {
    return joined;
  }

  return '(No readable text returned for this URI. Prefer a specific doc entry instead of a collection link.)';
};

/**
 * Locate the server CLI entry for spawning a stdio MCP child (built `dist/` or dev `tsx`).
 *
 * @returns Command and args to exec before `--client` is appended.
 */
const resolveServerSpawn = (): ServerSpawnSpec => {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const require = createRequire(import.meta.url);

  const distCandidates = [
    join(moduleDir, 'cli.js'),
    join(moduleDir, '..', 'cli.js'),
    join(moduleDir, '..', '..', 'dist', 'cli.js'),
    join(process.cwd(), 'dist', 'cli.js')
  ];

  for (const entry of distCandidates) {
    if (existsSync(entry)) {
      return { command: process.execPath, args: [entry] };
    }
  }

  const srcCandidates = [
    join(moduleDir, '..', 'cli.ts'),
    join(moduleDir, '..', '..', 'src', 'cli.ts')
  ];

  for (const entry of srcCandidates) {
    if (existsSync(entry)) {
      const tsxCli = require.resolve('tsx/cli');

      return { command: process.execPath, args: [tsxCli, entry] };
    }
  }

  throw new Error(
    'PatternFly MCP server entry not found. Run `npm run build` or use a source checkout with src/cli.ts.'
  );
};

/**
 * @deprecated Prefer {@link resolveServerSpawn}. Returns dist path only when present.
 */
const resolveDefaultServerPath = (): string => {
  const spawn = resolveServerSpawn();

  return spawn.args[spawn.args.length - 1] ?? join(process.cwd(), 'dist', 'cli.js');
};

/**
 * MCP stdio client session for agentless search and resource reads.
 */
class AgentlessClientSession {
  private client: Client;
  private transport: StdioClientTransport;

  /**
   * @param spawn - Server process command (defaults to {@link resolveServerSpawn}).
   * @param extraArgs - Additional server CLI arguments (e.g. `--log-stderr`).
   */
  constructor(spawn: ServerSpawnSpec = resolveServerSpawn(), extraArgs: string[] = []) {
    this.transport = new StdioClientTransport({
      command: spawn.command,
      args: [...spawn.args, '--client', ...extraArgs],
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
   * @param collection - Optional primary collection filter.
   */
  async search(query: string, collection?: string): Promise<ResourceLinkItem[]> {
    const args: Record<string, string> = { query };

    if (collection) {
      args.collection = collection;
    }
    const result = await this.client.callTool({
      name: 'searchPatternFly',
      arguments: args
    }) as CallToolResult;

    return parseResourceLinks(result);
  }

  /**
   * Read markdown (or text) for a PatternFly resource URI.
   *
   * @param uri - MCP resource URI to read.
   */
  async readResource(uri: string): Promise<ResourceReadResult> {
    try {
      const result = await this.client.readResource({ uri });
      const text = materializeResourceText(result.contents ?? []);

      return { text, truncated: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        text: `# Unable to read resource\n\n\`${uri}\`\n\n${message}\n\nIf this was a **Collection** link, open a specific doc row from search instead.`,
        truncated: false
      };
    }
  }

  /** Close the MCP session and child server process. */
  async close(): Promise<void> {
    await this.client.close();
    await this.transport.close();
  }
}

export {
  AgentlessClientSession,
  materializeResourceText,
  MAX_TERMINAL_DISPLAY_CHARS,
  parseResourceLinks,
  resolveDefaultServerPath,
  resolveServerSpawn,
  type ResourceLinkItem,
  type ResourceReadResult,
  type ServerSpawnSpec
};
