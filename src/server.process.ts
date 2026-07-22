import { spawn, type ChildProcess } from 'node:child_process';
import { log } from './logger';

/**
 * Options for spawning a child process host.
 *
 * @property nodeArgs - Node.js command line arguments.
 * @property entryPath - Path to the entry script.
 * @property processName - Human-readable name for logging.
 * @property sessionId - Session identifier for tagging logs.
 */
interface ProcessHostOptions {
  nodeArgs: string[];
  entryPath: string;
  processName: string;
  sessionId: string;
}

/**
 * Debug a child process' stderr output by tagging and logging it.
 *
 * @param {ChildProcess} child - Child process to debug.
 * @param {object} options - Debugging options.
 * @param options.processName
 * @param options.sessionId
 * @returns {() => void} A cleanup function to stop listening to stderr.
 */
const debugChildStderr = (
  child: ChildProcess,
  { processName, sessionId }: { processName: string; sessionId: string }
) => {
  const childPid = child.pid;
  const debugHandler = (chunk: Buffer | string) => {
    const raw = String(chunk);

    if (!raw.trim()) {
      return;
    }

    const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

    for (const line of lines) {
      log.debug(`[${processName} pid=${childPid} sid=${sessionId}] ${line}`);
    }
  };

  child.stderr?.on('data', debugHandler);

  return () => child.stderr?.off('data', debugHandler);
};

/**
 * Spawn a Node.js child process with standard IPC configuration.
 *
 * @param {ProcessHostOptions} options - Spawning options.
 * @returns {ChildProcess} The spawned ChildProcess.
 */
const spawnProcess = (options: ProcessHostOptions): ChildProcess => spawn(process.execPath, [...options.nodeArgs, options.entryPath], {
  stdio: ['ignore', 'pipe', 'pipe', 'ipc']
});

export { debugChildStderr, spawnProcess, type ProcessHostOptions };
