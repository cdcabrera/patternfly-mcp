import { mkdirSync, createWriteStream } from 'fs';
import { join } from 'path';
import os from 'os';

/**
 * Resolves and generates file paths for log and PID files within a designated base directory.
 *
 * @param {string} [logFile] - Optional log file path for child process's logs. Defaults to `{home}/.pf-mcp/pf-mcp.log`.
 * @param {string} [pidFile] - Optional PID file path for child process's process ID. Defaults to `{home}/.pf-mcp/pf-mcp.pid`.
 * @returns {Object} An object containing the paths:
 * - `base` {string}: The base directory path.
 * - `logFile` {string}: The resolved or default log file path.
 * - `pidFile` {string}: The resolved or default PID file path.
 */
export const resolvePaths = (logFile?: string, pidFile?: string) => {
  const base = join(os.homedir(), '.pf-mcp');
  const updatedLogFile = logFile || join(base, 'pf-mcp.log');
  const updatedPidFile = pidFile || join(base, 'pf-mcp.pid');

  mkdirSync(base, { recursive: true });

  return { base, logFile: updatedLogFile, pidFile: updatedPidFile };
};

/**
 * Sets up file logging by redirecting console log, warn, and error outputs to a specified log file.
 *
 * @param {string} logFile - Log file path for child process's logs
 */
export const setupFileLogging = (logFile: string) => {
  const stream = createWriteStream(logFile, { flags: 'a' });

  const write = (level: string, args: any[]) => {
    const updatedDate = new Date().toISOString();
    const argsMap = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a)));

    stream.write(`[${updatedDate}] ${level} ${argsMap.join(' ')}\n`);
  };

  console.log = (...args: any[]) => write('INFO', args);
  console.warn = (...args: any[]) => write('WARN', args);
  console.error = (...args: any[]) => write('ERROR', args);

  process.on('exit', () => stream.end());
};
