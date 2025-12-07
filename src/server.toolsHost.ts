// Tools Host child process. Loads externals, provides a manifest, executes invokes.
// IMPORTANT: Never write to stdout. Use IPC only (and stderr if absolutely needed).

import { type IpcRequest, type IpcResponse, type ToolDescriptor, makeId } from './server.toolsIpc';
import { normalizeToCreators } from './server.tools';
import type { McpTool } from './server';

const toolMap = new Map<string, McpTool>();
const descriptors: ToolDescriptor[] = [];
let pluginInvokeTimeoutMs = 10000;

const serializeError = (errorValue: unknown) => ({
  message: (errorValue as any)?.message || String(errorValue),
  stack: (errorValue as any)?.stack
});

process.on('message', async (request: IpcRequest) => {
  try {
    switch (request.t) {
      case 'hello': {
        process.send?.({ t: 'hello:ack', id: request.id } satisfies IpcResponse);
        break;
      }
      case 'load': {
        // Optional per-call timeout provided by parent
        const maybeInvokeTimeout = (request as any)?.invokeTimeoutMs;
        if (typeof maybeInvokeTimeout === 'number' && Number.isFinite(maybeInvokeTimeout) && maybeInvokeTimeout > 0) {
          pluginInvokeTimeoutMs = maybeInvokeTimeout;
        }
        const warnings: string[] = [];
        const errors: string[] = [];

        for (const spec of request.specs || []) {
          try {
            const mod = await import(spec);
            const creators = normalizeToCreators(mod);

            for (const create of creators) {
              try {
                const tool = create();
                const toolId = makeId();

                toolMap.set(toolId, tool as McpTool);
                descriptors.push({
                  id: toolId,
                  name: tool[0],
                  description: tool[1]?.description || '',
                  inputSchema: tool[1]?.inputSchema ?? {},
                  source: spec
                });
              } catch (error) {
                warnings.push(
                  `Creator realization failed at ${spec}: ${String((error as Error).message || error)}`
                );
              }
            }
          } catch (error) {
            errors.push(`Failed import: ${spec}: ${String((error as Error).message || error)}`);
          }
        }
        process.send?.({ t: 'load:ack', id: request.id, warnings, errors } satisfies IpcResponse);
        break;
      }
      case 'manifest:get': {
        process.send?.({ t: 'manifest:result', id: request.id, tools: descriptors } satisfies IpcResponse);
        break;
      }
      case 'invoke': {
        const tool = toolMap.get(request.toolId);

        if (!tool) {
          process.send?.({
            t: 'invoke:result',
            id: request.id,
            ok: false,
            error: { message: 'Unknown toolId' }
          });
          break;
        }
        const handler = tool[2];
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          process.send?.({
            t: 'invoke:result',
            id: request.id,
            ok: false,
            error: { message: 'Invoke timeout' }
          });
        }, pluginInvokeTimeoutMs);
        if (typeof (timer as any).unref === 'function') {
          (timer as any).unref();
        }

        try {
          const result = await Promise.resolve(handler(request.args));

          if (!settled) {
            settled = true;
            clearTimeout(timer);
            process.send?.({ t: 'invoke:result', id: request.id, ok: true, result });
          }
        } catch (error) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            process.send?.({
              t: 'invoke:result',
              id: request.id,
              ok: false,
              error: serializeError(error)
            });
          }
        }
        break;
      }
      case 'shutdown': {
        process.send?.({ t: 'shutdown:ack', id: request.id });
        process.exit(0);
        break;
      }
    }
  } catch (error) {
    try {
      process.send?.({
        t: 'invoke:result',
        id: (request as any)?.id || 'n/a',
        ok: false,
        error: serializeError(error)
      } as any);
    } catch (innerError) {
      // ignore error report failures
    }
  }
});

// Exit if the parent disconnects.
process.on('disconnect', () => {
  process.exit(0);
});
