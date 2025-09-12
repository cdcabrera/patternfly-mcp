import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { ComponentDocs } from './componentDocs.js';
import { LayoutDocs } from './layoutDocs.js';
import { ChartDocs } from './chartDocs.js';
import { localReadmeLinks } from './constants.js';
import { resolvePaths } from './helpers.js';

export class PatternflyMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: '@cdcabrera/patternfly-mcp',
        version: '1.2.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private readonly docsPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'documentation');

  private usePatternFlyDocs = async (urlList: string[]): Promise<string> => {
    try {
      const results: string[] = [];

      for (const url of urlList) {
        try {
          if (url.startsWith('http://') || url.startsWith('https://')) {
            const response = await fetch(url);
            if (!response.ok) {
              results.push(`❌ Failed to fetch ${url}: ${response.status} ${response.statusText}`);
              continue;
            }
            const content = await response.text();
            results.push(`# Documentation from ${url}\n\n${content}`);
          } else {
            try {
              const content = await readFile(url, 'utf-8');
              results.push(`# Documentation from ${url}\n\n${content}`);
            } catch (fileError) {
              results.push(`❌ Failed to read local file ${url}: ${fileError}`);
            }
          }
        } catch (error) {
          results.push(`❌ Error processing ${url}: ${error}`);
        }
      }

      return results.join('\n\n---\n\n');
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch documentation: ${error}`
      );
    }
  };

  private async fetchDocs(urls: string[]): Promise<string> {
    try {
      const results: string[] = [];

      for (const url of urls) {
        try {
          if (url.startsWith('http://') || url.startsWith('https://')) {
            const response = await fetch(url);
            if (!response.ok) {
              results.push(`❌ Failed to fetch ${url}: ${response.status} ${response.statusText}`);
              continue;
            }

            const content = await response.text();
            results.push(`# Documentation from ${url}\n\n${content}`);
          } else {
            try {
              const content = await readFile(url, 'utf-8');
              results.push(`# Documentation from ${url}\n\n${content}`);
            } catch (fileError) {
              results.push(`❌ Failed to read local file ${url}: ${fileError}`);
            }
          }
        } catch (error) {
          results.push(`❌ Error processing ${url}: ${error}`);
        }
      }

      return results.join('\n\n---\n\n');
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to fetch documentation: ${error}`
      );
    }
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'usePatternFlyDocs',
            description:
              `You must use this tool to answer any questions related to PatternFly components or documentation.

              The description of the tool contains links to .md files or local file paths that the user has made available.

              ${ComponentDocs.join('\n')}
              ${LayoutDocs.join('\n')}
              ${ChartDocs.join('\n')}
              ${localReadmeLinks.join('\n')}

              1. Pick the most suitable URL from the above list, and use that as the "urlList" argument for this tool's execution, to get the docs content. If it's just one, let it be an array with one URL.
              2. Analyze the URLs listed in the .md file
              3. Then fetch specific documentation pages relevant to the user's question with the subsequent tool call.`,
            inputSchema: {
              type: 'object',
              properties: {
                urlList: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'The list of urls to fetch the documentation from',
                },
              },
              required: ['urlList'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
          {
            name: 'fetchDocs',
            description: 'Fetch documentation for one or more URLs extracted from previous tool calls responses. The URLs should be passed as an array in the "urls" argument.',
            inputSchema: {
              type: 'object',
              properties: {
                urls: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'The list of URLs to fetch documentation from',
                },
              },
              required: ['urls'],
              additionalProperties: false,
              $schema: 'http://json-schema.org/draft-07/schema#',
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      const { name, arguments: args } = request.params;
      try {
        switch (name) {
          case 'usePatternFlyDocs': {
            const urlList = args?.urlList ? (args.urlList as string[]) : null;
            if (!urlList || !Array.isArray(urlList)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                `Missing required parameter: urlList (must be an array of strings): ${urlList}`
              );
            }
            const result = await this.usePatternFlyDocs(urlList);
            return { content: [{ type: 'text', text: result }] };
          }
          case 'fetchDocs': {
            const urls = args?.urls ? (args.urls as string[]) : null;
            if (!urls || !Array.isArray(urls)) {
              throw new McpError(
                ErrorCode.InvalidParams,
                `Missing required parameter: urls (must be an array of strings): ${urls}`
              );
            }
            const result = await this.fetchDocs(urls);
            return { content: [{ type: 'text', text: result }] };
          }
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error}`);
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error: any) => {
      console.error('[MCP Error]', error);
    };
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
    process.on('SIGTERM', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('pf-mcp server running on stdio');
  }
}

export const runServer = async (): Promise<void> => {
  const server = new PatternflyMcpServer();
  await server.run();
};

/**
 * Asynchronously starts a daemon process in the background.
 *
 * Spawn a detached child process running the current Node.js script.
 *
 * @param {string} [logFile] - Optional log file path for child process's logs
 * @param {string} [pidFile] - Optional PID file path for child process's process ID
 */
export const startDaemon = async (logFile?: string, pidFile?: string) => {
  const { logFile: lf, pidFile: pf } = resolvePaths(logFile, pidFile);

  // If a previous daemon PID exists, try to stop it before starting a new one.
  if (existsSync(pf)) {
    try {
      const oldPid = Number(readFileSync(pf, 'utf8'));
      if (Number.isFinite(oldPid) && oldPid > 0) {
        let isRunning = false;
        try {
          process.kill(oldPid, 0); // Check if alive
          isRunning = true;
        } catch {
          isRunning = false; // Not running (stale file)
        }

        if (isRunning) {
          console.log(`Existing pf-mcp daemon detected (PID ${oldPid}). Stopping it first...`);
          try {
            process.kill(oldPid, 'SIGTERM');
          } catch {}

          const waitForExit = async (pid: number, timeoutMs = 5000) => {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
              try {
                process.kill(pid, 0);
              } catch {
                return true; // exited
              }
              await new Promise((r) => setTimeout(r, 100));
            }
            return false; // still running
          };

          const exited = await waitForExit(oldPid, 5000);
          if (!exited) {
            console.warn(`Process ${oldPid} did not exit after SIGTERM, sending SIGKILL...`);
            try {
              process.kill(oldPid, 'SIGKILL');
            } catch {}
            await waitForExit(oldPid, 2000);
          }
        }
      }
    } catch (e) {
      console.warn('Failed to inspect/stop existing daemon from PID file:', e);
    } finally {
      try { unlinkSync(pf); } catch {}
    }
  }

  // Spawn the CLI entry (index.js) with a hidden --child flag so the child process
  // will configure logging and run the server.
  const indexJs = join(dirname(fileURLToPath(import.meta.url)), 'index.js');
  const child = spawn(process.execPath, [indexJs, '--child', '--log', lf, '--pid', pf], {
    detached: true,
    // Keep stdin open (pipe) so the stdio server doesn't immediately see EOF and exit.
    stdio: ['pipe', 'ignore', 'ignore'],
  });

  child.unref();
  writeFileSync(pf, String(child.pid));

  console.log(`pf-mcp started in background (PID ${child.pid}). Logs: ${lf}`);
};

/**
 * Stops a running daemon process by sending a termination signal (SIGTERM)
 * to the process ID specified in the PID file. If the process is successfully
 * terminated, the PID file is deleted. Logs appropriate messages based on the
 * outcome of the operation.
 *
 * @param {string} [pidFile] - Optional path to the PID file that stores the
 * process ID of the running daemon. If not provided, a default path will be used.
 */
export const stopDaemon = (pidFile?: string) => {
  const { pidFile: pf } = resolvePaths(undefined, pidFile);

  if (!existsSync(pf)) {
    console.log('No PID file found. Is the daemon running?');
    return;
  }

  const pid = Number(readFileSync(pf, 'utf8'));

  try {
    process.kill(pid, 'SIGTERM');
    unlinkSync(pf);
    console.log(`Stopped pf-mcp (PID ${pid}).`);
  } catch (e) {
    console.error('Failed to stop process:', e);
  }
};

/**
 * Check if the daemon is running by verifying the PID in the pid file.
 * Returns { running: boolean, pid?: number }.
 */
export const statusDaemon = (pidFile?: string): { running: boolean; pid?: number } => {
  const { pidFile: pf } = resolvePaths(undefined, pidFile);
  if (!existsSync(pf)) {
    return { running: false };
  }
  const pid = Number(readFileSync(pf, 'utf8'));
  if (!Number.isFinite(pid) || pid <= 0) {
    return { running: false };
  }
  try {
    process.kill(pid, 0);
    return { running: true, pid };
  } catch {
    return { running: false };
  }
};
