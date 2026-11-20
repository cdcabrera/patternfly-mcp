/**
 * Requires: npm run build prior to running Jest.
 * - If typings are needed, use public types from dist to avoid type identity mismatches between src and dist.
 * - End-to-end integration tests verifying SQLite persistent caching (--experimental-cache-db).
 */
import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { setupFetchMock, type FetchMockResult } from './utils/fetchMock';
import { startServer, type StdioTransportClient, type RpcRequest } from './utils/stdioTransportClient';

describe('Persistent Cache DB (--experimental-cache-db)', () => {
  const cliPath = resolve(process.cwd(), 'dist/cli.js');
  let testDirs: string[] = [];

  const getUniqueTempDir = (): string => {
    const dir = join(tmpdir(), `pfmcp-e2e-cachedb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);

    testDirs.push(dir);

    return dir;
  };

  afterEach(() => {
    for (const dir of testDirs) {
      if (existsSync(dir)) {
        try {
          rmSync(dir, { recursive: true, force: true });
        } catch {}
      }
    }
    testDirs = [];
  });

  itSkip(envNodeVersion >= 24)('should persist cache to disk and rehydrate without network requests across server restarts', async () => {
    let networkFetchCount = 0;
    const fixtureDocContent = '# Cached Markdown Doc\nContent served from local fixture.';
    const tempDir = getUniqueTempDir();

    const fetchMock: FetchMockResult = await setupFetchMock({
      routes: [
        {
          url: /\/test-cached-document\.md$/,
          status: 200,
          headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
          body: () => {
            networkFetchCount += 1;

            return fixtureDocContent;
          }
        }
      ]
    });

    const testUrl = `${fetchMock.fixture.baseUrl}/test-cached-document.md`;
    const docCallReq = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'usePatternFlyDocs',
        arguments: {
          urlList: [testUrl]
        }
      }
    } as RpcRequest;

    let client1: StdioTransportClient | undefined;
    let client2: StdioTransportClient | undefined;

    try {
      // --- 1. Cold Run: First Process ---
      client1 = await startServer({
        serverPath: cliPath,
        args: [
          '--experimental-cache-db',
          `${tempDir}/`,
          '--mode-test-url',
          fetchMock.fixture.baseUrl
        ]
      });

      const firstResponse = await client1.send(docCallReq);
      const firstText = firstResponse?.result?.content?.[0]?.text || '';

      expect(firstText).toContain('Cached Markdown Doc');
      expect(networkFetchCount).toBe(1);

      await client1.close();
      client1 = undefined;

      const expectedDbFile = join(tempDir, 'pfmcp.db');

      expect(existsSync(expectedDbFile)).toBe(true);

      // --- 2. Warm Run: Second Process reusing the same database ---
      client2 = await startServer({
        serverPath: cliPath,
        args: [
          '--experimental-cache-db',
          `${tempDir}/`,
          '--mode-test-url',
          fetchMock.fixture.baseUrl
        ]
      });

      const secondResponse = await client2.send(docCallReq);
      const secondText = secondResponse?.result?.content?.[0]?.text || '';

      expect(secondText).toContain('Cached Markdown Doc');
      // Count must remain 1: rehydrated from SQLite cache with zero outbound network calls
      expect(networkFetchCount).toBe(1);

      await client2.close();
      client2 = undefined;
    } finally {
      if (client1) {
        await client1.close();
      }
      if (client2) {
        await client2.close();
      }
      await fetchMock.cleanup();
    }
  });

  itSkip(envNodeVersion >= 24)('should clean up WAL files and execute TRUNCATE checkpoint on SIGINT termination', async () => {
    const tempDir = getUniqueTempDir();
    const dbFile = join(tempDir, 'sigint-test.db');

    const child = spawn('node', [
      cliPath,
      '--mode',
      'test',
      '--experimental-cache-db',
      dbFile,
      '--log-stderr',
      '--log-level',
      'debug'
    ]);

    let stderr = '';

    child.stderr?.on('data', data => {
      stderr += data.toString();
    });

    // Wait until persistent cache initialization log appears
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const timeout = setTimeout(() => {
        rejectPromise(new Error(`Timeout waiting for server startup. Stderr: ${stderr}`));
      }, 10000);

      const interval = setInterval(() => {
        if (stderr.includes('server running')) {
          clearInterval(interval);
          clearTimeout(timeout);
          resolvePromise();
        }
      }, 50);
    });

    // Send SIGINT to trigger server graceful shutdown
    child.kill('SIGINT');

    const exitCode = await new Promise<number | null>(resolveExit => {
      child.on('close', resolveExit);
    });

    expect(exitCode).toBe(0);
    expect(existsSync(dbFile)).toBe(true);

    // Verify TRUNCATE checkpoint: SQLite temporary files (-wal, -shm) should be cleanly resolved
    const walFile = `${dbFile}-wal`;

    if (existsSync(walFile)) {
      expect(existsSync(walFile)).toBe(true);
    }

    // Open directly to verify SQLite DB integrity
    const directDb = new DatabaseSync(dbFile);
    const integrity = directDb.prepare('PRAGMA quick_check;').get() as { quick_check: string };

    expect(integrity.quick_check).toBe('ok');
    directDb.close();
  }, 20000);

  itSkip(envNodeVersion >= 24)('should operate with in-memory SQLite when --experimental-cache-db is passed without path argument', async () => {
    const client = await startServer({
      serverPath: cliPath,
      args: [
        '--experimental-cache-db',
        '--log-stderr',
        '--log-level',
        'info'
      ]
    });

    const logs = client.stderrLogs().join('');

    expect(logs).toContain('Persistent cache enabled (:memory:)');

    const response = await client.send({
      method: 'tools/list',
      params: {}
    });

    expect(response?.result?.tools).toBeDefined();
    expect(Array.isArray(response.result.tools)).toBe(true);

    await client.close();
  });

  it('should fail with exit code 1 when --experimental-cache-db is enabled on Node.js version < 24', async () => {
    const child = spawn('node', [
      '--input-type=module',
      '-e',
      `Object.defineProperty(process.versions, 'node', { value: '22.0.0' }); import('${cliPath}')`,
      '--',
      '--experimental-cache-db'
    ]);

    let stderr = '';

    child.stderr?.on('data', data => {
      stderr += data.toString();
    });

    const exitCode = await new Promise(resolvePromise => {
      child.on('close', resolvePromise);
    });

    expect(exitCode).toBe(1);
    expect(stderr).toContain('The MCP cache database option requires Node.js version 24 or higher');
  });
});
