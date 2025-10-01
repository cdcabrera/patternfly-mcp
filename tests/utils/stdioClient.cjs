#!/usr/bin/env node

// Lightweight JSON-RPC over stdio client for the built MCP server (dist/index.js)
// CommonJS module for Jest tests

const { spawn } = require('child_process');

/**
 * Start the MCP server process and return a client with send/stop APIs.
 *
 * Options:
 * - command: node command to run (default: 'node')
 * - serverPath: path to built server (default: process.env.SERVER_PATH || 'dist/index.js')
 * - args: additional args to pass to server (e.g., ['--docs-host'])
 * - env: env vars to pass to child
 */
async function startServer({ command = 'node', serverPath = process.env.SERVER_PATH || 'dist/index.js', args = [], env = {} } = {}) {
  const proc = spawn(command, [serverPath, ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...env },
  });

  const pending = new Map(); // id -> { resolve, reject, timer }
  let buffer = '';
  let stderr = '';
  let isClosed = false;

  const clearAllPending = (reason) => {
    for (const [id, p] of pending.entries()) {
      clearTimeout(p.timer);
      p.reject(new Error(`Server closed before response id=${id}. ${reason || ''} stderr: ${stderr}`));
      pending.delete(id);
    }
  };

  proc.stdout.on('data', (data) => {
    buffer += data.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // ignore non-JSON lines
      }
      if (msg && Object.prototype.hasOwnProperty.call(msg, 'id') && pending.has(msg.id)) {
        const { resolve, timer } = pending.get(msg.id);
        clearTimeout(timer);
        pending.delete(msg.id);
        resolve(msg);
      }
    }
  });

  proc.stderr.on('data', (data) => {
    stderr += data.toString();
  });

  const stop = (signal = 'SIGINT') => new Promise((resolve) => {
    if (isClosed) return resolve();
    isClosed = true;
    try { proc.kill(signal); } catch {}
    proc.on('close', () => {
      clearAllPending('Process closed.');
      resolve();
    });
  });

  const send = (request, { timeoutMs } = {}) => new Promise((resolve, reject) => {
    if (!request || typeof request !== 'object') return reject(new Error('Invalid request'));
    const id = request.id ?? Math.floor(Math.random() * 1e9);
    const rpc = { jsonrpc: '2.0', ...request, id };
    const ms = Number(process.env.TEST_TIMEOUT_MS ?? timeoutMs ?? 20000);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timeout waiting for response id=${id}. stderr: ${stderr}`));
    }, ms);
    pending.set(id, { resolve, reject, timer });
    try {
      proc.stdin.write(JSON.stringify(rpc) + '\n');
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err);
    }
  });

  return { proc, send, stop };
}

module.exports = { startServer };
