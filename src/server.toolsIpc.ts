// IPC protocol types and small helpers for Parent <-> Tools Host

export type IpcRequest =
  | { t: 'hello'; id: string } |
  { t: 'load'; id: string; specs: string[] } |
  { t: 'manifest:get'; id: string } |
  { t: 'invoke'; id: string; toolId: string; args: unknown } |
  { t: 'shutdown'; id: string };

export type SerializedError = { message: string; stack?: string; code?: string };

export type ToolDescriptor = {
  id: string;
  name: string;
  description: string;
  inputSchema: any;
  source?: string;
};

export type IpcResponse =
  | { t: 'hello:ack'; id: string } |
  { t: 'load:ack'; id: string; warnings: string[]; errors: string[] } |
  { t: 'manifest:result'; id: string; tools: ToolDescriptor[] } |
  { t: 'invoke:result'; id: string; ok: true; result: unknown } |
  { t: 'invoke:result'; id: string; ok: false; error: SerializedError } |
  { t: 'shutdown:ack'; id: string };

export const send = (
  proc: NodeJS.Process | import('node:child_process').ChildProcess,
  msg: IpcRequest
): boolean => Boolean(proc.send?.(msg));

export const once = <T extends IpcResponse>(
  proc: NodeJS.Process,
  matcher: (m: any) => m is T,
  timeoutMs: number
): Promise<T> => new Promise((resolve, reject) => {
  let done = false;
  const cleanup = () => {
    proc.off('message', onMessage);
    proc.off('exit', onExit);
    proc.off('disconnect', onExit);
    clearTimeout(timer as any);
  };
  const onMessage = (m: any) => {
    if (done) { return; }
    if (matcher(m)) {
      done = true;
      cleanup();
      resolve(m);
    }
  };
  const onExit = (code?: number, signal?: string) => {
    if (done) { return; }
    done = true;
    cleanup();
    reject(new Error(`Tools Host exited before response (code=${code}, signal=${signal || 'none'})`));
  };
  const timer = setTimeout(() => {
    if (done) { return; }
    done = true;
    cleanup();
    reject(new Error('Timed out waiting for IPC response'));
  }, timeoutMs);

  proc.on('message', onMessage);
  proc.on('exit', onExit);
  proc.on('disconnect', onExit);
});

export const makeId = () => Math.random().toString(36).slice(2);
