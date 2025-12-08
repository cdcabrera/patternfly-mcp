import { type IpcRequest, type ToolDescriptor, makeId } from './server.toolsIpc';
import { normalizeToCreators } from './server.tools';
import type { McpTool } from './server';

/**
 * SubType of IpcRequest for "hello" requests.
 */
type HelloRequest = Extract<IpcRequest, { t: 'hello' }>;

/**
 * SubType of IpcRequest for "load" requests.
 */
type LoadRequest = Extract<IpcRequest, { t: 'load' }>;

/**
 * SubType of IpcRequest for "manifest:get" requests.
 */
type ManifestGetRequest = Extract<IpcRequest, { t: 'manifest:get' }>;

/**
 * SubType of IpcRequest for "invoke" requests.
 */
type InvokeRequest = Extract<IpcRequest, { t: 'invoke' }>;

/**
 * SubType of IpcRequest for "shutdown" requests.
 */
type ShutdownRequest = Extract<IpcRequest, { t: 'shutdown' }>;

// NEEDS TO BE UPDATED HANGING OUT IN THE GLOBAL SPACE IS BAD: This is a global map of all tools loaded by the host process.
const toolMap = new Map<string, McpTool>();

// NEEDS TO BE UPDATED HANGING OUT IN THE GLOBAL SPACE IS BAD
const descriptors: ToolDescriptor[] = [];

// NEEDS TO BE UPDATED HANGING OUT IN THE GLOBAL SPACE IS BAD
let pluginInvokeTimeoutMs = 10000;

/**
 * Serialize an error value into a structured object.
 *
 * @param errorValue
 */
const serializeError = (errorValue: unknown) => {
  const err = errorValue as Error | undefined;

  return {
    message: (err && err.message) || String(errorValue),
    stack: err && err.stack
  };
};

/**
 * Acknowledge a hello request.
 *
 * @param request
 */
const requestHello = (request: HelloRequest) => {
  process.send?.({ t: 'hello:ack', id: request.id });
};

/**
 * Load tools from the provided list of module specifiers.
 *
 * @param request
 */
const requestLoad = async (request: LoadRequest) => {
  // Optional per-call timeout provided by parent
  const maybeInvokeTimeout = request?.invokeTimeoutMs;

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

  process.send?.({ t: 'load:ack', id: request.id, warnings, errors });
};

/**
 * Respond to a manifest request with a list of available tools.
 *
 * @param request
 */
const requestManifestGet = (request: ManifestGetRequest) => {
  process.send?.({ t: 'manifest:result', id: request.id, tools: descriptors });
};

/**
 * Handle tool invocation requests.
 *
 * @param request
 */
const requestInvoke = async (request: InvokeRequest) => {
  const tool = toolMap.get(request.toolId);

  if (!tool) {
    process.send?.({
      t: 'invoke:result',
      id: request.id,
      ok: false,
      error: { message: 'Unknown toolId' }
    });

    return;
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

  timer?.unref?.();

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
        error: serializeError(error as Error)
      });
    }
  }
};

/**
 * Handle shutdown requests.
 *
 * @param request
 */
const requestShutdown = (request: ShutdownRequest) => {
  process.send?.({ t: 'shutdown:ack', id: request.id });
  process.exit(0);
};

/**
 * Fallback handler for unhandled errors.
 *
 * @param {IpcRequest} request - Original IPC request object.
 * @param {Error} error - Failed request error object
 *
 * Attempt to send a structured message back to the IPC channel. The message includes:
 * - Type of response ('invoke:result').
 * - Request identifier, or 'n/a' if the request ID is unavailable.
 * - Operation status (`ok: false`).
 * - Serialized error object.
 *
 * Any issues during this process (e.g., if `process.send` is unavailable) fail silently.
 */
const requestFallback = (request: IpcRequest, error: Error) => {
  try {
    process.send?.({
      t: 'invoke:result',
      id: request?.id || 'n/a',
      ok: false,
      error: serializeError(error)
    });
  } catch {}
};

/**
 * Handle incoming IPC (Inter-Process Communication) messages.
 *
 * Process the request and execute the corresponding handler function for each type. A fallback handler
 * is triggered on error.
 *
 * @param {IpcRequest} request - The IPC request object containing the type of request and associated data.
 * @throws {Error} - Any error, pass the request through the fallback handler.
 *
 * @remarks
 * Supported request types:
 * - 'hello': Trigger the `requestHello` handler.
 * - 'load': Trigger the `requestLoad` handler.
 * - 'manifest:get': Trigger the `requestManifestGet` handler.
 * - 'invoke': Trigger the asynchronous `requestInvoke` handler.
 * - 'shutdown': Trigger the `requestShutdown` handler.
 */
const handlerMessage = async (request: IpcRequest) => {
  try {
    switch (request.t) {
      case 'hello':
        requestHello(request);
        break;

      case 'load':
        requestLoad(request);
        break;

      case 'manifest:get':
        requestManifestGet(request);
        break;

      case 'invoke': {
        await requestInvoke(request);
        break;
      }
      case 'shutdown': {
        requestShutdown(request);
        break;
      }
    }
  } catch (error) {
    requestFallback(request, error as Error);
  }
};

/**
 * Listen for incoming IPC messages.
 */
process.on('message', handlerMessage);

/**
 * Handle process disconnects.
 */
const handlerDisconnect = () => {
  process.exit(0);
};

/**
 * Handle process disconnects.
 */
process.on('disconnect', handlerDisconnect);

export {
  handlerMessage,
  handlerDisconnect,
  requestHello,
  requestLoad,
  requestManifestGet,
  requestInvoke,
  requestShutdown,
  requestFallback
};
