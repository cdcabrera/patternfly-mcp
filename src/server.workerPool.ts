import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';
import { formatUnknownError } from './logger';

/**
 * Payload for a task execution, including module details, arguments, and configuration options.
 *
 * @interface TaskPayload
 *
 * @property moduleSpecifier Identifier for the module to be imported or executed as part of the
 *     task.
 * @property [exportName] Optional name of the exported function or variable from the specified
 *     module to be invoked or used.
 * @property [args] Optional arguments to be passed to the task or function being executed.
 * @property [options] Optional additional options or settings for executing the task.
 * @property [session] Optional session-specific data or context associated with the task
 *     execution.
 */
interface TaskPayload {
  moduleSpecifier: string;
  exportName?: string;
  args?: unknown;
  options?: unknown;
  session?: unknown;
}

/**
 * Throttled worker thread pool for parallel execution.
 *
 * @interface QueuedTask
 *
 * @property payload Task payload.
 * @property resolve Promise resolve function.
 * @property reject Promise reject function.
 */
interface QueuedTask {
  payload: TaskPayload;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

/**
 * Throttled worker thread pool for parallel execution.
 *
 * @interface WorkerPoolInstance
 *
 * @property runTask Run task method.
 */
interface WorkerPoolInstance {
  runTask<T>(payload: TaskPayload): Promise<T>;
}

/**
 * Creates a throttled worker thread pool factory for parallel execution.
 *
 * @param {number} [maxWorkers] - Maximum active threads.
 * @returns {WorkerPoolInstance} Throttled worker pool instance.
 */
const createWorkerPool = (maxWorkers = Math.max(1, availableParallelism() - 1)): WorkerPoolInstance => {
  let activeWorkers = 0;
  const queue: QueuedTask[] = [];
  let workerScript: string;

  try {
    workerScript = fileURLToPath(import.meta.resolve('#workerEntry'));
  } catch {
    // Fallback for Jest test environments to point to the compiled dist worker entry
    workerScript = new URL('../dist/server.workerEntry.js', import.meta.url).pathname;
  }

  const next = (): void => {
    if (activeWorkers >= maxWorkers || queue.length === 0) {
      return;
    }

    const task = queue.shift();

    if (!task) {
      return;
    }

    activeWorkers += 1;

    spawnWorker(task);
  };

  const spawnWorker = (task: QueuedTask): void => {
    const { payload, resolve, reject } = task;

    try {
      const worker = new Worker(workerScript, {
        workerData: payload
      });

      let resolved = false;

      worker.on('message', message => {
        resolved = true;

        if (message.success) {
          resolve(message.payload);
        } else {
          reject(formatUnknownError(message.error));
        }

        worker.terminate().catch(() => {});
      });

      worker.on('error', err => {
        resolved = true;

        reject(err);
        worker.terminate().catch(() => {});
      });

      worker.on('exit', code => {
        activeWorkers -= 1;

        if (!resolved) {
          reject(new Error(`Worker exited unexpectedly with code ${code}`));
        }

        // Trigger the next queued task
        next();
      });
    } catch (error) {
      activeWorkers -= 1;

      reject(error);

      next();
    }
  };

  const runTask = <T>(payload: TaskPayload): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push({ payload, resolve, reject });

      next();
    });

  return {
    runTask
  };
};

/**
 * Create the worker thread pool.
 */
const globalWorkerPool = createWorkerPool();

export {
  createWorkerPool,
  globalWorkerPool,
  type TaskPayload,
  type WorkerPoolInstance
};
