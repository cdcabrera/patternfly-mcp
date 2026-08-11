import { pathToFileURL } from 'node:url';
import { parentPort, workerData } from 'node:worker_threads';

import { runWithOptions, runWithSession } from './options.context';

interface WorkerTaskData {
  moduleSpecifier: string;
  exportName?: string;
  args?: unknown;
  options?: unknown;
  session?: unknown;
}

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
      throw new TypeError(`Exported module '${moduleSpecifier}' (export: '${exportName}') must be a function.`);
    }

    // Nest inside parent-side options and session contexts
    const result = await runWithOptions((options as any) || {}, async () => {
      const sessionRes = await runWithSession((session as any) || {}, async () => {
        const instantiated = callback(options);

        let actualHandler = callback;

        if (Array.isArray(instantiated) && typeof instantiated[1] === 'function') {
          actualHandler = instantiated[1];
        }

        return Promise.resolve(actualHandler(args));
      });

      return sessionRes;
    });

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
  } finally {
    process.exit(0);
  }
};

runWorker();
export {};
