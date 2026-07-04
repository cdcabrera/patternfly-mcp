import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { formatUnknownError, log } from './logger';
import { getOptions, getSessionOptions } from './options.context';
import type { AppSession, GlobalOptions } from './options';

/**
 * Handle for a spawned PatternFly API Host process.
 *
 * @property child - Child process
 * @property closeStderr - Optional function to close stderr reader
 */
type HostHandle = {
  child: ChildProcess;
  closeStderr?: () => void;
};

/**
 * Map of active API Hosts per session.
 */
const activeHostsBySession = new Map<string, HostHandle>();

// Spawn the PatternFly API host.
const spawnApiHost = async (
  options: GlobalOptions = getOptions()
): Promise<HostHandle> => {
  const { nodeVersion, pluginIsolation, pluginHost } = options || {};
  const { loadTimeoutMs, invokeTimeoutMs } = pluginHost || {};
  const nodeArgs: string[] = [];
  let updatedEntry: string | undefined = undefined;

  try {
    const entryUrl = import.meta.resolve('#patternFlyHost');

    updatedEntry = fileURLToPath(entryUrl);
  } catch (error) {
    log.debug(`Failed to import.meta.resolve PatternFly API Host entry '#patternFlyHost': ${formatUnknownError(error)}`);

    if (process.env.NODE_ENV === 'local') {
      updatedEntry = '/mock/path/to/patternFlyHost.js';
    }
  }

  if (updatedEntry === undefined) {
    throw new Error(`Failed to resolve Tools Host entry '#patternFlyHost'.`);
  }
};

const sendApiHostShutdown = async (
  { pluginHost }: GlobalOptions = getOptions(),
  { sessionId }: AppSession = getSessionOptions()
): Promise<void> => {};

export {

};
