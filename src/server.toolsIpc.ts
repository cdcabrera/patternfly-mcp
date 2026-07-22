import { type ChildProcess } from 'node:child_process';
import {
  awaitIpc as baseAwaitIpc,
  isHelloAck,
  makeId,
  send,
  type BaseIpcRequest,
  type BaseIpcResponse,
  type SerializedError
} from './server.processIpc';
import { type ToolOptions } from './options.tools';

/**
 * IPC (Inter-Process Communication) request messages for the Tools Host.
 */
type IpcRequest = BaseIpcRequest & (
  { t: 'hello' } |
  { t: 'load'; specs: string[]; invokeTimeoutMs?: number; toolOptions?: ToolOptions } |
  { t: 'manifest:get' } |
  { t: 'invoke'; toolId: string; args: unknown } |
  { t: 'shutdown' }
);

/**
 * Tool descriptor object for IPC.
 */
type ToolDescriptor = {
  id: string;
  name: string;
  description: string;
  inputSchema: any;
  source?: string;
};

/**
 * Inter-Process Communication (IPC) responses for the Tools Host.
 */
type IpcResponse = BaseIpcResponse & (
  { t: 'hello:ack' } |
  { t: 'load:ack'; warnings: string[]; errors: string[] } |
  { t: 'manifest:result'; tools: ToolDescriptor[] } |
  { t: 'invoke:result'; ok: true; result: unknown } |
  { t: 'invoke:result'; ok: false; error: SerializedError } |
  { t: 'shutdown:ack' }
);

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
): Promise<T> => baseAwaitIpc(processRef, matcher, timeoutMs, 'Tools Host');

/**
 * Check if a message is a "load" response.
 *
 * @param expectedId - Expected identifier to match against the message `id` field.
 * @returns Function that takes a message and determines if it conforms to the expected structure.
 */
const isLoadAck = (expectedId: string) => (message: any): message is {
  t: 'load:ack'; id: string; warnings: string[]; errors: string[]
} => {
  if (!message || message.t !== 'load:ack' || message.id !== expectedId) {
    return false;
  }

  return Array.isArray(message.warnings) && Array.isArray(message.errors);
};

/**
 * Check if a message is a "manifest" response.
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
 * Check if a message is an "invoke" response.
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
  awaitIpc,
  isHelloAck,
  isInvokeResult,
  isLoadAck,
  isManifestResult,
  makeId,
  send,
  type IpcRequest,
  type IpcResponse,
  type SerializedError,
  type ToolDescriptor
};
