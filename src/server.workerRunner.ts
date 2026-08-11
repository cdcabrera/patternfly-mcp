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
 * Asynchronous function `runWorker` serves as an execution routine for worker threads.
 * Dynamically imports a specified module and executes its exported function,
 * optionally applying nested options and session contexts.
 *
 * - Resolves and validates the module specifier provided in the worker task data.
 * - Supports dynamic import of the specified module, bypassing static analysis restrictions.
 * - Validates and invokes the desired exported function, supporting both named and default exports.
 * - Handles nested execution with options and session-specific contexts.
 * - Communicates execution results or errors back to the parent thread via `parentPort`.
 * - Ensures proper termination of the worker process after execution completion.
 *
 * Throws errors in the following cases:
 * - `moduleSpecifier` is not specified in the worker task data.
 * - Exported module does not contain a valid function for the specified `exportName`.
 *
 * Uses the following destructured properties from the worker task data:
 * - `moduleSpecifier`: The location or URI of the module to be imported and executed.
 * - `exportName`: The name of the export to be used (default is `'default'`).
 * - `args`: The arguments to pass to the executed function.
 * - `options`: Optional configuration object to be used within the function execution.
 * - `session`: Optional session context to be employed during the execution.
 */
const runWorker = async () => {
  const { moduleSpecifier, exportName = 'default', args, options, session } = workerData as WorkerTaskData;

  try {
    if (!moduleSpecifier) {
      throw new Error('No moduleSpecifier specified for worker task.');
    }

    let resolvedSpec = moduleSpecifier;

    if (resolvedSpec.startsWith('#')) {
      resolvedSpec = import.meta.resolve(resolvedSpec);
    } else if (!resolvedSpec.startsWith('file://') && !resolvedSpec.startsWith('data:')) {
      resolvedSpec = pathToFileURL(resolvedSpec).href;
    }

    // Dynamically import the target ESM module using Function constructor
    // to bypass bundler static analysis (e.g., Rollup dynamic import restrictions)
    const dynamicImport = new Function('spec', 'return import(spec)') as (spec: string) => Promise<any>;
    const module = await dynamicImport(resolvedSpec);

    // Support named or default callback resolutions
    const callback = module[exportName] || (exportName === 'default' ? module.default : undefined);

    if (typeof callback !== 'function') {
      throw new Error(`Exported module '${moduleSpecifier}' (export: '${exportName}') must be a function.`);
    }

    // Nest inside parent-side options and session contexts
    // runWithOptions and runWithSession being asyncLocalStorage wrappers
    const result = await runWithOptions((options as any) || {}, async () =>
      runWithSession((session as any) || {}, async () =>
        Promise.resolve(callback(args))));

    parentPort?.postMessage({
      success: true,
      payload: result
    });
  } catch (error: any) {
    parentPort?.postMessage({
      success: false,
      error: {
        message: error?.message || String(error),
        stack: error?.stack
      }
    });
  }
};

export { runWorker, type WorkerTaskData };
