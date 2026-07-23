import { type ProcessRequest, serializeError } from './server.processIpc';

/**
 * Context passed to every handler, providing a bound reply helper.
 *
 * @property send - Send a response back over the IPC channel (no-op if unavailable).
 */
type HostContext = {
  send: (response: Record<string, unknown>) => void;
};

/**
 * Map of message type to handler. `hello` is provided by default and may be overridden.
 */
type HostHandlers = {
  [messageType: string]: (request: ProcessRequest, ctx: HostContext) => void | Promise<void>;
};

/**
 * Reply helper bound to `process.send`.
 *
 * @param response
 */
const reply = (response: Record<string, unknown>) => {
  process.send?.(response);
};

/**
 * Fallback handler for unhandled errors. Attempts a best-effort structured
 * error message back over the IPC channel and fails silently otherwise.
 *
 * @param {ProcessRequest} request - Original IPC request object.
 * @param {Error} error - Failed request error object.
 */
const requestFallback = (request: ProcessRequest, error: Error) => {
  try {
    process.send?.({
      t: `${request?.t || 'unknown'}:error`,
      id: request?.id || 'n/a',
      ok: false,
      error: serializeError(error)
    });
  } catch {}
};

/**
 * Default `hello` handler. Acknowledges the handshake.
 *
 * @param {ProcessRequest} request
 * @param {HostContext} ctx
 */
const helloHandler = (request: ProcessRequest, ctx: HostContext) => {
  ctx.send({ t: 'hello:ack', id: request.id });
};

/**
 * Install the message router and disconnect handler for a child process.
 *
 * Routes each request to the matching handler in `handlers`. A built-in `hello`
 * handler is provided and can be overridden. Errors are passed to `requestFallback`.
 *
 * @param {HostHandlers} handlers - Map of message type to handler.
 * @returns The router function (used by the one-shot bootstrap).
 */
const setHandlers = (handlers: HostHandlers) => {
  const routes: HostHandlers = { hello: helloHandler, ...handlers };
  const ctx: HostContext = { send: reply };

  /**
   * Handle incoming IPC messages by looking up the handler for the message type.
   *
   * @param {ProcessRequest} request
   */
  const handlerMessage = async (request: ProcessRequest) => {
    try {
      const handler = routes[request?.t];

      if (handler) {
        await handler(request, ctx);
      }
    } catch (error) {
      requestFallback(request, error as Error);
    }
  };

  process.on('message', handlerMessage);

  /**
   * Handle process disconnects.
   */
  const handlerDisconnect = () => {
    process.exit(0);
  };

  process.on('disconnect', handlerDisconnect);

  // Expose the router for bootstrapping.
  return handlerMessage;
};

/**
 * Create a generic child-process host with a one-shot bootstrap.
 *
 * The first message removes the bootstrap listener, installs the real handlers,
 * and re-routes the first message through the same code path.
 *
 * @param {HostHandlers} handlers - Map of message type to handler.
 */
const createProcessHost = (handlers: HostHandlers) => {
  /**
   * Lazy initialize IPC handlers. One-shot: detach then install real handlers.
   *
   * @param {ProcessRequest} first
   */
  const bootstrapMessage = (first: ProcessRequest) => {
    // Detach bootstrap to avoid duplicate delivery
    process.off('message', bootstrapMessage);

    // Install real handlers and get a reference to the router
    const route = setHandlers(handlers);

    // Route the very first message through the same code path
    void route(first);
  };

  if (process.send) {
    process.on('message', bootstrapMessage);
  }

  return { bootstrapMessage, setHandlers: () => setHandlers(handlers) };
};

export {
  createProcessHost,
  setHandlers,
  requestFallback,
  helloHandler,
  type HostHandlers,
  type HostContext
};
