import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';
import { runWithOptions, runWithSession } from './options.context';

/**
 * Data required to define and execute a worker task.
 *
 * @interface WorkerTaskData
 *
 * @property moduleSpecifier String that specifies the module to be imported or loaded.
 * @property [exportName] Optional string that specifies the name of the export within the module to invoke.
 * @property [args] Optional arguments to be passed to the task being executed.
 * @property [options] Optional configuration or metadata related to the task execution.
 * @property [session] Optional session information or context related to the task environment.
 */
interface WorkerTaskData {
  moduleSpecifier: string;
  exportName?: string;
  args?: unknown;
  options?: unknown;
  session?: unknown;
}

/**
 * Execute a task defined by the provided payload.
 *
 * - Dynamically import a module
 * - Identify the specified export (default or named)
 * - Invokes the callback with the given arguments.
 *
 * @param {WorkerTaskData} taskPayload - The task payload containing details about the module to load,
 *     the export to invoke, and arguments to pass to the export.
 * @param taskPayload.moduleSpecifier - The path or URL identifying the module to be imported.
 *     It must be a valid module specifier.
 * @param [taskPayload.exportName='default'] - The name of the export to invoke. Defaults to
 *     'default' if not specified.
 * @param taskPayload.args - Arguments to pass to the exported function when called.
 * @param [taskPayload.options] - Configuration options that define specific execution settings.
 * @param [taskPayload.session] - Data describing the session context for task isolation.
 * @throws {Error} If the `moduleSpecifier` is not provided, or if the specified export is not a function.
 * @returns A promise that resolves to the result of the invoked export function.
 */
const executeTask = async (taskPayload: WorkerTaskData): Promise<unknown> => {
  const { moduleSpecifier, exportName = 'default', args, options, session } = taskPayload;

  if (!moduleSpecifier) {
    throw new Error('No moduleSpecifier specified for worker task.');
  }

  let resolvedSpec = moduleSpecifier;

  if (resolvedSpec.startsWith('#')) {
    resolvedSpec = import.meta.resolve(resolvedSpec);
  } else if (!resolvedSpec.startsWith('file://') && !resolvedSpec.startsWith('data:')) {
    resolvedSpec = pathToFileURL(resolvedSpec).href;
  }

  // Bypass static bundler boundaries cleanly via scoped Function constructor
  const dynamicImport = new Function('spec', 'return import(spec)') as (spec: string) => Promise<any>;
  const module = await dynamicImport(resolvedSpec);

  // Map to default fallback hooks if explicit targets are missing
  const callback = module[exportName] || (exportName === 'default' ? module.default : undefined);

  if (typeof callback !== 'function') {
    throw new Error(`Exported module '${moduleSpecifier}' (export: '${exportName}') must be a function.`);
  }

  // Nest execution within both AsyncLocalStorage isolation layouts
  return runWithOptions((options as any) || {}, async () =>
    runWithSession((session as any) || {}, async () =>
      Promise.resolve(callback(args))));
};

/**
 * Route orchestration based on worker thread startup context.
 *
 * Two distinct routes:
 * 1. **Route A: Transient Execution**
 *    - If `workerData` is provided, the worker immediately processes the task using the
 *        provided data.
 *    - Upon task completion, a success or failure message is posted back to the parent thread
 *        via the `parentPort`.
 *
 * 2. **Route B: Persistent Execution**
 *    - If `workerData` is not available, the worker remains active and listens for incoming
 *        task payloads via `parentPort`.
 *    - When a task message is received, it processes the task and sends a success or failure
 *        message back to the parent thread.
 *
 * Both routes use async and handle errors gracefully to relate results or errors back to the parent.
 */
const runWorker = (): Promise<void> | void => {
  if (workerData) {
    /**
     * Route A: Transient execution (workerData is loaded immediately)
     *
     * `keepAliveGuard` — a refed no-op interval that holds the worker's event
     * loop open for the entire duration of the task. Without it, if the task's
     * pending async chain relies solely on `unref()`-ed handles (e.g. throttle
     * timers in `promiseQueue`, undici's idle keep-alive sockets, per-request
     * fetch abort timers) the worker's refed-handle count momentarily hits
     * zero between async steps, Node concludes the loop is idle, and the
     * worker exits cleanly with code 0 mid-work — surfacing to the parent as
     * "Transient worker exited unexpectedly with code 0".
     *
     * Applied here (in the runner) instead of inside individual helpers like
     * `delay()`, so that any current or future `unref()` usage inside a task
     * is transparently covered without needing a caller-side opt-in.
     *
     * Cleared in `.finally()` so the worker spins down promptly once the task
     * settles.
     */
    const keepAliveGuard = setInterval(() => {}, 1_000_000);

    return executeTask(workerData as WorkerTaskData)
      .then(result => {
        parentPort?.postMessage({ success: true, payload: result });
      })
      .catch((error: any) => {
        parentPort?.postMessage({
          success: false,
          error: { message: error?.message || String(error), stack: error?.stack }
        });
      })
      .finally(() => {
        clearInterval(keepAliveGuard);
      });
  } else {
    /**
     * Route B: Persistent execution (Thread stays open waiting for stream events)
     */
    parentPort?.on('message', async (incomingPayload: WorkerTaskData) => {
      try {
        const result = await executeTask(incomingPayload);

        parentPort?.postMessage({ success: true, payload: result });
      } catch (error: any) {
        parentPort?.postMessage({
          success: false,
          error: { message: error?.message || String(error), stack: error?.stack }
        });
      }
    });
  }
};

export { runWorker, executeTask, type WorkerTaskData };
