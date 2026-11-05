import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpClient, McpStdioClientTransport, type McpClientCallToolResult } from './mcpSdk';
import { memo } from './server.caching';
import { getOptions, getSessionOptions } from './options.context';
import { type GlobalOptions } from './options';
import { runInteractiveClient } from './client.screens';

/**
 * A linkable resource item.
 *
 * @interface ResourceLinkItem
 *
 * @property uri - Resource URI.
 * @property name - Resource name.
 * @property description - Optional resource description.
 * @property groupId - Optional group ID for resource association.
 * @property recordId - Optional record ID for resource association.
 * @property primaryCollection - Optional primary collection ID for resource association.
 */
interface ResourceLinkItem {
  uri: string;
  name: string;
  description?: string | undefined;
  groupId?: string | undefined;
  recordId?: string | undefined;
  primaryCollection?: string | undefined;
}

/**
 * A resource read result.
 *
 * @interface ResourceReadResult
 *
 * @property text - Resource text content.
 * @property truncated - Whether the resource text was truncated.
 */
interface ResourceReadResult {
  text: string;
  truncated: boolean;
}

/**
 * A server spawn specification.
 *
 * @interface ServerSpawnSpec
 *
 * @property command - The command to spawn.
 * @property args - The arguments to pass to the command.
 */
interface ServerSpawnSpec {
  command: string;
  args: string[];
}

/**
 * Async MCP client instance.
 *
 * @interface ClientInstance
 *
 * @property connect - Connect to the resource service.
 * @property search - Search available resources.
 * @property readResource - Read resource contents by URI.
 * @property close - Close the client connection.
 * @property isConnected - Check if the client is connected.
 */
interface ClientInstance {
  connect: () => Promise<void>;
  search: (query: string, collection?: string) => Promise<ResourceLinkItem[]>;
  readResource: (uri: string) => Promise<ResourceReadResult>;
  close: () => Promise<void>;
  isConnected: () => boolean;
  runInteractive: (initialQuery?: string, initialCollection?: string) => Promise<void>;
}

/**
 * Client options. Extends GlobalOptions with optional spawn overrides.
 */
type ClientOptions = Partial<GlobalOptions> & {
  spawn?: ServerSpawnSpec;
  extraArgs?: string[];
};

/**
 * Client settings matching server lifecycle options.
 */
interface ClientSettings {
  allowProcessExit?: boolean;
}

/**
 * Maximum terminal display characters.
 */
const MAX_TERMINAL_DISPLAY_CHARS = 512_000;

/**
 * Determine whether a tool result content item is a "resource link".
 *
 * @param item - Tool result content item to inspect.
 * @returns `true` if the item is a resource link content object; otherwise, `false`.
 */
const isResourceLinkContent = (
  item: McpClientCallToolResult['content'] extends (infer U)[] | undefined ? U : never
): item is { type: 'resource_link'; uri: string; name: string; description?: string } =>
  typeof item === 'object' &&
  item !== null &&
  (item as { type?: string }).type === 'resource_link' &&
  typeof (item as { uri?: string }).uri === 'string' &&
  typeof (item as { name?: string }).name === 'string';

/**
 * Parse resource links from a call tool result.
 *
 * @param result
 */
const parseResourceLinks = (result: McpClientCallToolResult): ResourceLinkItem[] => {
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

    const recordId =
      (typeof meta?.recordId === 'string' && meta.recordId) ||
      (typeof (item as any).recordId === 'string' && (item as any).recordId) ||
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
      ...(recordId ? { recordId } : {}),
      ...(primaryCollection ? { primaryCollection } : {}),
      ...(item.description !== undefined ? { description: item.description } : {})
    };
  });
};

/**
 * Convert resource-read result contents to text.
 *
 * TODO: rename this function
 *
 * @param contents
 */
const materializeResourceText = (contents: NonNullable<Awaited<ReturnType<McpClient['readResource']>>['contents']>): string => {
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
 * @returns Command and args to exec before `--experimental-client` is appended.
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
 * MCP client for agentless search and resource reads.
 *
 * TODO: the entire resolveServerSpawn function needs to be re-evaluated under the guise of "unnecessary bot add" and "sure, lets over-eng it".
 *
 * @param [options] - Client options.
 * @param [_settings] - Client lifecycle settings.
 * @returns Client instance with search, read, and interactive UI methods.
 */
const runClient = async (
  options: ClientOptions = getOptions(),
  _settings: ClientSettings = {}
): Promise<ClientInstance> => {
  const _session = getSessionOptions();
  const spawn = options.spawn || resolveServerSpawn();
  const extraArgs = options.extraArgs || [];
  let connected = false;

  const serverArgs = [...spawn.args, '--experimental-client'];

  if (options.logging?.stderr) {
    serverArgs.push('--log-stderr');
  }

  serverArgs.push(...extraArgs);

  const transport = new McpStdioClientTransport({
    command: spawn.command,
    args: serverArgs,
    stderr: 'pipe'
  });

  const client = new McpClient(
    {
      name: options.name || getOptions().name,
      version: options.version || getOptions().version
    },
    { capabilities: {} }
  );

  const connect = async (): Promise<void> => {
    if (connected) {
      return;
    }
    await client.connect(transport);
    connected = true;
  };

  const search = async (query: string, collection?: string): Promise<ResourceLinkItem[]> => {
    const args: Record<string, string> = { query };

    if (collection) {
      args.collection = collection;
    }

    const result = (await client.callTool({
      name: 'searchPatternFly',
      arguments: args
    })) as McpClientCallToolResult;

    return parseResourceLinks(result);
  };

  const readResource = async (uri: string): Promise<ResourceReadResult> => {
    try {
      const result = await client.readResource({ uri });
      const text = materializeResourceText(result.contents ?? []);

      return { text, truncated: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        text: `# Unable to read resource\n\n\`${uri}\`\n\n${message}\n\nIf this was a **Collection** link, open a specific doc row from search instead.`,
        truncated: false
      };
    }
  };

  const close = async (): Promise<void> => {
    connected = false;
    await client.close();
    await transport.close();
  };

  const isConnected = (): boolean => connected;

  const runInteractive = async (initialQuery = '', initialCollection?: string): Promise<void> => {
    await connect();
    try {
      await runInteractiveClient(instance, initialQuery, initialCollection);
    } finally {
      await close();
    }
  };

  const instance: ClientInstance = {
    connect,
    search,
    readResource,
    close,
    isConnected,
    runInteractive
  };

  return instance;
};

/**
 * Memoized version of runClient.
 * - Prevents multiple duplicate MCP server child processes from spawning for identical spawn specs.
 * - Closes and terminates the session if rolled out of cache.
 */
runClient.memo = memo(
  runClient,
  {
    cacheLimit: 1,
    onCacheRollout: async ({ removed }) => {
      const results = await Promise.allSettled(removed);

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const session = result.value;

          try {
            await session?.close();
          } catch (error) {
            console.error(`Error closing memoized client session on rollout: ${error}`);
          }
        }
      }
    }
  }
);

export {
  runClient,
  materializeResourceText,
  MAX_TERMINAL_DISPLAY_CHARS,
  parseResourceLinks,
  resolveServerSpawn,
  type ClientInstance,
  type ClientOptions,
  type ResourceLinkItem,
  type ResourceReadResult,
  type ServerSpawnSpec
};
