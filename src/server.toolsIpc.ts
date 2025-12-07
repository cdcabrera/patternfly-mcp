// IPC protocol types and small helpers for Parent <-> Tools Host

type IpcRequest =
  | { t: 'hello'; id: string } |
  { t: 'load'; id: string; specs: string[]; invokeTimeoutMs?: number } |
  { t: 'manifest:get'; id: string } |
  { t: 'invoke'; id: string; toolId: string; args: unknown } |
  { t: 'shutdown'; id: string };

type SerializedError = { message: string; stack?: string; code?: string };

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

const send = (
  processRef: NodeJS.Process | import('node:child_process').ChildProcess,
  request: IpcRequest
): boolean => Boolean(processRef.send?.(request));

const awaitIpc = <T extends IpcResponse>(
  processRef: NodeJS.Process,
  matcher: (message: any) => message is T,
  timeoutMs: number
): Promise<T> => new Promise((resolve, reject) => {
  let settled = false;

  const cleanup = () => {
    processRef.off('message', onMessage);
    processRef.off('exit', onExit);
    processRef.off('disconnect', onExit);
    clearTimeout(timerId as any);
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

  // Do not keep the process alive due to this timer
  if (typeof (timerId as any).unref === 'function') {
    (timerId as any).unref();
  }

  processRef.on('message', onMessage);
  processRef.on('exit', onExit);
  processRef.on('disconnect', onExit);
});

const makeId = () => Math.random().toString(36).slice(2);

// IPC message type guards
const isHelloAck = (message: any): message is { t: 'hello:ack'; id: string } => {
  if (!message) {
    return false;
  }
  if (message.t !== 'hello:ack') {
    return false;
  }
  return typeof message.id === 'string';
};

const isLoadAck = (expectedId: string) => (message: any): message is {
  t: 'load:ack'; id: string; warnings: string[]; errors: string[]
} => {
  if (!message) {
    return false;
  }
  if (message.t !== 'load:ack') {
    return false;
  }
  if (message.id !== expectedId) {
    return false;
  }
  const hasWarnings = Array.isArray(message.warnings);
  const hasErrors = Array.isArray(message.errors);
  return hasWarnings && hasErrors;
};

const isManifestResult = (expectedId: string) => (message: any): message is {
  t: 'manifest:result'; id: string; tools: ToolDescriptor[]
} => {
  if (!message) {
    return false;
  }
  if (message.t !== 'manifest:result') {
    return false;
  }
  if (message.id !== expectedId) {
    return false;
  }
  return Array.isArray(message.tools);
};

const isInvokeResult = (expectedId: string) => (message: any): message is (
  { t: 'invoke:result'; id: string; ok: true; result: unknown } |
  { t: 'invoke:result'; id: string; ok: false; error: SerializedError }
) => {
  if (!message) {
    return false;
  }
  if (message.t !== 'invoke:result') {
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
