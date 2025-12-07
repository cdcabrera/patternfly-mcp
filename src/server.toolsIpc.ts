// IPC protocol types and small helpers for Parent <-> Tools Host

type IpcRequest =
  | { t: 'hello'; id: string }
  | { t: 'load'; id: string; specs: string[] }
  | { t: 'manifest:get'; id: string }
  | { t: 'invoke'; id: string; toolId: string; args: unknown }
  | { t: 'shutdown'; id: string };

type SerializedError = { message: string; stack?: string; code?: string };

type ToolDescriptor = {
  id: string;
  name: string;
  description: string;
  inputSchema: any;
  source?: string;
};

type IpcResponse =
  | { t: 'hello:ack'; id: string }
  | { t: 'load:ack'; id: string; warnings: string[]; errors: string[] }
  | { t: 'manifest:result'; id: string; tools: ToolDescriptor[] }
  | { t: 'invoke:result'; id: string; ok: true; result: unknown }
  | { t: 'invoke:result'; id: string; ok: false; error: SerializedError }
  | { t: 'shutdown:ack'; id: string };

const send = (
  proc: NodeJS.Process | import('node:child_process').ChildProcess,
  request: IpcRequest
): boolean => {
  return Boolean(proc.send?.(request));
};

const once = <T extends IpcResponse>(
  proc: NodeJS.Process,
  matcher: (message: any) => message is T,
  timeoutMs: number
): Promise<T> => new Promise((resolve, reject) => {
  let settled = false;

  const cleanup = () => {
    proc.off('message', onMessage);
    proc.off('exit', onExit);
    proc.off('disconnect', onExit);
    clearTimeout(timer as any);
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

  const timer = setTimeout(() => {
    if (settled) {
      return;
    }

    settled = true;
    cleanup();
    reject(new Error('Timed out waiting for IPC response'));
  }, timeoutMs);

  proc.on('message', onMessage);
  proc.on('exit', onExit);
  proc.on('disconnect', onExit);
});

const makeId = () => Math.random().toString(36).slice(2);

export {
  send,
  once,
  makeId,
  type IpcRequest,
  type IpcResponse,
  type ToolDescriptor,
  type SerializedError
};
