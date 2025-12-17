import { type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { type ToolOptions } from './options.tools';

type IpcRequest =
  | { t: 'hello'; id: string } |
  { t: 'load'; id: string; specs: string[]; invokeTimeoutMs?: number; toolOptions?: ToolOptions } |
  { t: 'manifest:get'; id: string } |
  { t: 'invoke'; id: string; toolId: string; args: unknown } |
  { t: 'shutdown'; id: string };

type SerializedError = { message: string; stack?: string; code?: string; cause?: unknown; details?: unknown };

type ToolDescriptor = {
  id: string;
  name: string;
  description: string;
  inputSchema: any;
  source?: string;
};

type IpcResponse =
  | { t: 'hello:ack'; id: string } |
  { t: 'load:ack'; id: string; warnings: string[]; errors: string[] } |
  { t: 'manifest:result'; id: string; tools: ToolDescriptor[] } |
  { t: 'invoke:result'; id: string; ok: true; result: unknown } |
  { t: 'invoke:result'; id: string; ok: false; error: SerializedError } |
  { t: 'shutdown:ack'; id: string };

/**
 * Generate a unique ID for IPC messages.
 */
const makeId = () => randomUUID();

/**
 * Send an IPC message to the provided process.
 *
 * @param processRef
 * @param {IpcRequest} request
 */
const send = (
  processRef: NodeJS.Process | ChildProcess,
  request: IpcRequest
): boolean => Boolean(processRef.send?.(request));

/**
 * Await an IPC response from the provided process.
 *
 * @param processRef
 * @param matcher
 * @param timeoutMs
 */
const awaitIpc = <T extends IpcResponse>(
  processRef: NodeJS.Process | ChildProcess,
  matcher: (message: any) => message is T,
  timeoutMs: number
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
    reject(new Error(`Tools Host exited before response (code=${code}, signal=${signal || 'none'})`));
  };

  const timerId = setTimeout(() => {
    if (settled) {
      return;
    }

    settled = true;
    cleanup();
    reject(new Error('Timed out waiting for IPC response'));
  }, timeoutMs);

  timerId?.unref?.();

  processRef.on('message', onMessage);
  processRef.on('exit', onExit);
  processRef.on('disconnect', onExit);
});

/**
 * Check if a message is a "hello" response. IPC message type guards.
 *
 * @param message
 */
const isHelloAck = (message: any): message is { t: 'hello:ack'; id: string } => {
  if (!message || message.t !== 'hello:ack') {
    return false;
  }

  return typeof message.id === 'string';
};

/**
 * Check if a message is a "load" response. IPC message type guards.
 *
 * Checks
 * - If a given message is a valid load acknowledgment (`load:ack`) with expected id
 * - That the message contains the proper structure, including the required fields and
 *     correct types for `warnings` and `errors`.
 *
 * @param expectedId - Expected identifier to match against the message `id` field.
 * @returns Function that takes a message and determines if it conforms to the expected structure and values.
 */
const isLoadAck = (expectedId: string) => (message: any): message is {
  t: 'load:ack'; id: string; warnings: string[]; errors: string[]
} => {
  if (!message || message.t !== 'load:ack' || message.id !== expectedId) {
    return false;
  }

  const hasWarnings = Array.isArray(message.warnings);
  const hasErrors = Array.isArray(message.errors);

  return hasWarnings && hasErrors;
};

/**
 * Check if a message is a "manifest" response. IPC message type guards.
 *
 * @param expectedId
 */
const isManifestResult = (expectedId: string) => (message: any): message is {
  t: 'manifest:result'; id: string; tools: ToolDescriptor[]
} => {
  if (!message || message.t !== 'manifest:result' || message.id !== expectedId) {
    return false;
  }

  return Array.isArray(message.tools);
};

/**
 * Check if a message is an "invoke" response. IPC message type guards.
 *
 * @param expectedId
 */
const isInvokeResult = (expectedId: string) => (message: any): message is
  { t: 'invoke:result'; id: string; ok: true; result: unknown } |
  { t: 'invoke:result'; id: string; ok: false; error: SerializedError } => {
  if (!message || message.t !== 'invoke:result') {
    return false;
  }

  return message.id === expectedId;
};

export {
  send,
  awaitIpc,
  makeId,
  isHelloAck,
  isLoadAck,
  isManifestResult,
  isInvokeResult,
  type IpcRequest,
  type IpcResponse,
  type ToolDescriptor,
  type SerializedError
};
