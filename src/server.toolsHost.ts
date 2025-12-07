import { type IpcRequest, type ToolDescriptor, makeId } from './server.toolsIpc';
import { normalizeToCreators } from './server.toolsCreator';
import { DEFAULT_OPTIONS } from './options.defaults';
import { type ToolOptions } from './options.tools';
import { type McpTool } from './server';
// import { type GlobalOptions } from './options';

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

/**
 * State object for the tools host.
 */
type HostState = {
  toolMap: Map<string, McpTool>;
  descriptors: ToolDescriptor[];
  invokeTimeoutMs: number;
};

/**
 * Create a new host state object.
 *
 * @param invokeTimeoutMs
 */
const createHostState = (invokeTimeoutMs = DEFAULT_OPTIONS.pluginHost.invokeTimeoutMs): HostState => ({
  toolMap: new Map<string, McpTool>(),
  descriptors: [],
  invokeTimeoutMs
});

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
 * Perform tool loading and return a new state object.
 *
 * @param {LoadRequest} request
 * @returns {HostState & { warnings: string[]; errors: string[] }} - New state object with updated tools and warnings/errors.
 */
const performLoad = async (request: LoadRequest): Promise<HostState & { warnings: string[]; errors: string[] }> => {
  const nextInvokeTimeout = typeof request?.invokeTimeoutMs === 'number' && Number.isFinite(request.invokeTimeoutMs) && request.invokeTimeoutMs > 0
    ? request.invokeTimeoutMs
    : DEFAULT_OPTIONS.pluginHost.invokeTimeoutMs;

  const state = createHostState(nextInvokeTimeout);
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const spec of request.specs || []) {
    try {
      // review the plugin @rollup/plugin-dynamic-import-vars
      // const mod = await import(spec);
      const dynamicImport = new Function('spec', 'return import(spec)') as (spec: string) => Promise<any>;
      const mod = await dynamicImport(spec);
      const toolOptions: ToolOptions | undefined = request.toolOptions;
      const creators = normalizeToCreators(mod, toolOptions);

      for (const creator of creators) {
        try {
          const create = creator as (opts?: unknown) => McpTool;
          const tool = create(toolOptions);
          const toolId = makeId();

          state.toolMap.set(toolId, tool as McpTool);
          state.descriptors.push({
            id: toolId,
            name: tool[0],
            description: tool[1]?.description || '',
            inputSchema: tool[1]?.inputSchema ?? {},
            source: spec
          });
        } catch (error) {
          warnings.push(`Creator realization failed at ${spec}: ${String((error as Error).message || error)}`);
        }
      }
    } catch (error) {
      errors.push(`Failed import: ${spec}: ${String((error as Error).message || error)}`);
    }
  }

  return { ...state, warnings, errors };
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
 * @param {LoadRequest} request
 * @param warningsErrors
 * @param warningsErrors.warnings - List of warnings generated during tool loading.
 * @param warningsErrors.errors - List of errors generated during tool loading.
 */
const requestLoad = (
  request: LoadRequest,
  { warnings = [], errors = [] }: { warnings?: string[]; errors?: string[] } = {}
) => {
  process.send?.({ t: 'load:ack', id: request.id, warnings, errors });
};

/**
 * Respond to a manifest request with a list of available tools.
 *
 * @param {HostState} state
 * @param {ManifestGetRequest} request
 */
const requestManifestGet = (state: HostState, request: ManifestGetRequest) => {
  process.send?.({ t: 'manifest:result', id: request.id, tools: state.descriptors });
};

/**
 * Handle tool invocation requests.
 *
 * @param {HostState} state
 * @param {InvokeRequest} request
 */
const requestInvoke = async (state: HostState, request: InvokeRequest) => {
  const tool = state.toolMap.get(request.toolId);

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
  }, state.invokeTimeoutMs);

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
 * Initializes and sets up handlers for incoming IPC (Inter-Process Communication) messages.
 */
const setHandlers = () => {
  let state: HostState = createHostState();

  /**
   * Load tools from the provided list of module specifiers. Splits out warnings/errors
   * before updating state.
   *
   * @param {LoadRequest} request
   */
  const onRequestLoad = async (request: LoadRequest) => {
    const loaded = await performLoad(request);

    state = {
      toolMap: loaded.toolMap,
      descriptors: loaded.descriptors,
      invokeTimeoutMs: loaded.invokeTimeoutMs
    };

    requestLoad(request, { warnings: loaded.warnings, errors: loaded.errors });
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
          await onRequestLoad(request);
          break;

        case 'manifest:get':
          requestManifestGet(state, request);
          break;

        case 'invoke': {
          await requestInvoke(state, request);
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

  // Expose the router for bootstrapping.
  return handlerMessage;
};

/**
 * Lazy initialize for IPC (Inter-Process Communication) handlers.
 *
 * This is a one-shot process: the first message received will remove itself then
 * trigger the real handler setup.
 *
 * @param {IpcRequest} first
 */
const bootstrapMessage = (first: IpcRequest) => {
  // Detach bootstrap to avoid duplicate delivery
  process.off('message', bootstrapMessage);

  // Install real handlers and get a reference to the router
  const route = setHandlers();

  // Route the very first message through the same code path the real handler uses
  // Use void to fire-and-forget async operations to avoid blocking
  void route(first);
};

if (process.send) {
  process.on('message', bootstrapMessage);
}

export {
  setHandlers,
  requestHello,
  requestLoad,
  requestManifestGet,
  requestInvoke,
  requestShutdown,
  requestFallback
};
