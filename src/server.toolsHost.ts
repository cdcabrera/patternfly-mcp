// Tools Host child process. Loads externals, provides a manifest, executes invokes.
// IMPORTANT: Never write to stdout. Use IPC only (and stderr if absolutely needed).

import { type IpcRequest, type IpcResponse, type ToolDescriptor } from './server.toolsIpc';
import { normalizeToCreators } from './server.tools';

type ToolTuple = [
  string,
  { description: string; inputSchema: any },
  (args: any) => Promise<any> | any
];

const toolMap = new Map<string, ToolTuple>();
const descriptors: ToolDescriptor[] = [];

const pluginInvokeTimeoutMs = 10000;

const makeId = () => Math.random().toString(36).slice(2);

const serializeError = (e: unknown) => ({
  message: (e as any)?.message || String(e),
  stack: (e as any)?.stack
});

process.on('message', async (msg: IpcRequest) => {
  try {
    switch (msg.t) {
      case 'hello': {
        process.send?.({ t: 'hello:ack', id: msg.id } satisfies IpcResponse);
        break;
      }
      case 'load': {
        const warnings: string[] = [];
        const errors: string[] = [];

        for (const spec of msg.specs || []) {
          try {
            const mod = await import(spec);
            const creators = normalizeToCreators(mod);

            for (const create of creators) {
              try {
                const tool = create();
                const toolId = makeId();

                toolMap.set(toolId, tool as ToolTuple);
                descriptors.push({
                  id: toolId,
                  name: tool[0],
                  description: tool[1]?.description || '',
                  inputSchema: tool[1]?.inputSchema ?? {},
                  source: spec
                });
              } catch (e) {
                warnings.push(
                  `Creator realization failed at ${spec}: ${String((e as Error).message || e)}`
                );
              }
            }
          } catch (e) {
            errors.push(`Failed import: ${spec}: ${String((e as Error).message || e)}`);
          }
        }
        process.send?.({ t: 'load:ack', id: msg.id, warnings, errors } satisfies IpcResponse);
        break;
      }
      case 'manifest:get': {
        process.send?.({ t: 'manifest:result', id: msg.id, tools: descriptors } satisfies IpcResponse);
        break;
      }
      case 'invoke': {
        const tool = toolMap.get(msg.toolId);

        if (!tool) {
          process.send?.({
            t: 'invoke:result',
            id: msg.id,
            ok: false,
            error: { message: 'Unknown toolId' }
          });
          break;
        }
        const handler = tool[2];
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) { return; }
          settled = true;
          process.send?.({
            t: 'invoke:result',
            id: msg.id,
            ok: false,
            error: { message: 'Invoke timeout' }
          });
        }, pluginInvokeTimeoutMs);

        try {
          const result = await Promise.resolve(handler(msg.args));

          if (!settled) {
            settled = true;
            clearTimeout(timer);
            process.send?.({ t: 'invoke:result', id: msg.id, ok: true, result });
          }
        } catch (e) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            process.send?.({
              t: 'invoke:result',
              id: msg.id,
              ok: false,
              error: serializeError(e)
            });
          }
        }
        break;
      }
      case 'shutdown': {
        process.send?.({ t: 'shutdown:ack', id: msg.id });
        process.exit(0);
        break;
      }
    }
  } catch (e) {
    try {
      process.send?.({
        t: 'invoke:result',
        id: (msg as any)?.id || 'n/a',
        ok: false,
        error: serializeError(e)
      } as any);
    } catch {
      // ignore
    }
  }
});

// Exit if the parent disconnects.
process.on('disconnect', () => process.exit(0));
