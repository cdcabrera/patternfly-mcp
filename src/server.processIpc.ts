import { type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/**
 * Serialized error object for IPC.
 *
 * @property message - Error message.
 * @property stack - Error stack trace.
 * @property code - Error code.
 * @property cause - Error cause.
 * @property details - Additional details.
 */
type SerializedError = {
  message: string;
  stack?: string;
  code?: string;
  cause?: unknown;
  details?: unknown;
};

/**
 * Base structure for all IPC request messages.
 *
 * @property t - Message type.
 * @property id - Message identifier.
 */
interface BaseIpcRequest {
  t: string;
  id: string;
}

/**
 * Base structure for all IPC response messages.
 *
 * @property t - Message type.
 * @property id - Message identifier.
 */
interface BaseIpcResponse {
  t: string;
  id: string;
}

/**
 * Generate a unique ID for IPC messages.
 *
 * @returns A random UUID string.
 */
const makeId = () => randomUUID();

/**
 * Send an IPC message to the provided process.
 *
 * @template T - Type of the IPC request object.
 *
 * @param {NodeJS.Process | ChildProcess} processRef - Process or ChildProcess to send to.
 * @param {T} request - IPC request object.
 * @returns {boolean} True if the message was sent successfully.
 */
const send = <T extends BaseIpcRequest>(
  processRef: NodeJS.Process | ChildProcess,
  request: T
): boolean => Boolean(processRef.send?.(request));

/**
 * Await an IPC response from the provided process.
 *
 * @template T - Type of the IPC response object.
 *
 * @param {NodeJS.Process | ChildProcess} processRef - Process or ChildProcess to listen to.
 * @param {(message: any) => message is T} matcher - Type guard to identify the target response.
 * @param {number} timeoutMs - Timeout in milliseconds.
 * @param {string} [processName='Child Process'] - Human-readable name for error messages.
 * @returns {Promise<T>} Resolves with the matching IPC response.
 */
const awaitIpc = <T extends BaseIpcResponse>(
  processRef: NodeJS.Process | ChildProcess,
  matcher: (message: any) => message is T,
  timeoutMs: number,
  processName = 'Child Process'
): Promise<T> => new Promise((resolve, reject) => {
  let settled = false;

  const cleanup = () => {
    processRef.off('message', onMessage);
    processRef.off('exit', onExit);
    processRef.off('disconnect', onExit);
    clearTimeout(timerId);
  };

  const onMessage = (message: any) => {
    if (settled) {
      return;
    }

    if (matcher(message)) {
      settled = true;
      cleanup();
      resolve(message);
    }
  };

  const onExit = (code?: number, signal?: string) => {
    if (settled) {
      return;
    }

    settled = true;
    cleanup();
    reject(new Error(`${processName} exited before response (code=${code}, signal=${signal || 'none'})`));
  };

  const timerId = setTimeout(() => {
    if (settled) {
      return;
    }

    settled = true;
    cleanup();
    reject(new Error(`Timed out waiting for ${processName} IPC response (${timeoutMs}ms)`));
  }, timeoutMs);

  // Allow the timer to be non-blocking if the event loop is otherwise empty
  timerId?.unref?.();

  processRef.on('message', onMessage);
  processRef.on('exit', onExit);
  processRef.on('disconnect', onExit);
});

/**
 * Type guard for the standard "hello:ack" response.
 *
 * @param {any} message - Message to check.
 * @returns {boolean} True if the message is a hello:ack.
 */
const isHelloAck = (message: any): message is { t: 'hello:ack'; id: string } =>
  Boolean(message) && message.t === 'hello:ack' && typeof message.id === 'string';

export {
  awaitIpc,
  isHelloAck,
  makeId,
  send,
  type BaseIpcRequest,
  type BaseIpcResponse,
  type SerializedError
};
