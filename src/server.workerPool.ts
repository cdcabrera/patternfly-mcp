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
 * Resolves the location of the worker entry script safely across bundling and testing frameworks.
 */
const getWorkerScriptPath = (): string => {
  try {
    return fileURLToPath(import.meta.resolve('#workerEntry'));
  } catch {
    return new URL('../dist/server.workerEntry.js', import.meta.url).pathname;
  }
};

/**
 * Create a transient worker pool with the specified maximum number of workers.
 * Spawns a fresh thread per task, kills it instantly on completion
 *
 * @note Recommended use is for heavy memory usage, unpredictable processing, and
 * long-running scraping cycles.
 *
 * @param [maxWorkers] -Max number of workers that can run concurrently. Defaults to one
 *     less than the available parallelism of the system, with a minimum value of 1.
 * @returns {WorkerPoolInstance} - An instance of a worker pool, allowing tasks
 *     to be queued and executed using dedicated transient workers.
 */
const createTransientPool = (maxWorkers = Math.max(1, availableParallelism() - 1)): WorkerPoolInstance => {
  let activeWorkers = 0;
  const queue: QueuedTask[] = [];
  const workerScript = getWorkerScriptPath();

  const next = (): void => {
    if (activeWorkers >= maxWorkers || queue.length === 0) {
      return;
    }

    const task = queue.shift();

    if (!task) {
      return;
    }

    activeWorkers += 1;
    spawnTransientWorker(task);
  };

  const spawnTransientWorker = (task: QueuedTask): void => {
    const { payload, resolve, reject } = task;
    let resolved = false;

    try {
      // Pass workerData right away to trigger transient execution flow
      const worker = new Worker(workerScript, { workerData: payload });

      worker.on('message', message => {
        resolved = true;
        if (message && message.success) {
          resolve(message.payload);
        } else {
          reject(formatUnknownError(message?.error ?? 'Unknown worker error'));
        }
      });

      worker.on('error', err => {
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });

      worker.on('exit', code => {
        activeWorkers -= 1;

        if (!resolved) {
          resolved = true;
          reject(new Error(`Transient worker exited unexpectedly with code ${code}`));
        }

        next();
      });
    } catch (error) {
      activeWorkers -= 1;

      if (!resolved) {
        resolved = true;
        reject(error);
      }

      next();
    }
  };

  return {
    runTask: <T>(payload: TaskPayload): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        queue.push({ payload, resolve, reject });
        next();
      })
  };
};

/**
 * Create a persistent worker pool with pre-spawned worker threads for handling concurrent tasks.
 * Keeps warm threads active, route payloads via IPC messages.
 *
 * @note Recommended for rapid, light, or frequent computations requiring low-latency invocation.
 *
 * @param [maxWorkers] -Max number of workers that can run concurrently. Defaults to one
 *     less than the available parallelism of the system, with a minimum value of 1.
 * @returns {WorkerPoolInstance} Object exposing methods to interact with the worker pool,
 *     including submitting tasks for execution.
 */
const createPersistentPool = (maxWorkers = Math.max(1, availableParallelism() - 1)): WorkerPoolInstance => {
  const queue: QueuedTask[] = [];
  const workers: { worker: Worker; active: boolean }[] = [];
  const workerScript = getWorkerScriptPath();

  const handleWorkerCrash = (index: number) => {
    if (workers?.[index]) {
      workers[index].worker?.removeAllListeners();
      workers[index].worker = new Worker(workerScript);
      workers[index].active = false;
    }

    next();
  };

  // Pre-spawn and warm up the permanent thread containers
  for (let i = 0; i < maxWorkers; i++) {
    const worker = new Worker(workerScript); // Instantiated WITHOUT initial workerData

    workers.push({ worker, active: false });

    worker.on('error', () => handleWorkerCrash(i));
    worker.on('exit', () => handleWorkerCrash(i));
  }

  const next = (): void => {
    if (queue.length === 0) {
      return;
    }

    const idleWorkerSlot = workers.find(w => !w.active);

    if (!idleWorkerSlot) {
      return;
    }

    const task = queue.shift();

    if (!task) {
      return;
    }

    idleWorkerSlot.active = true;
    const { worker } = idleWorkerSlot;
    const { payload, resolve, reject } = task;

    const onMessage = (message: any) => {
      cleanup();
      if (message && message.success) {
        resolve(message.payload);
      } else {
        reject(formatUnknownError(message?.error ?? 'Unknown worker error'));
      }
    };

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      idleWorkerSlot.active = false;

      next();
    };

    worker.on('message', onMessage);
    worker.on('error', onError);

    // Send the task data via postMessage channel to be captured by persistent listeners
    worker.postMessage(payload);
  };

  return {
    runTask: <T>(payload: TaskPayload): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        queue.push({ payload, resolve, reject });
        next();
      })
  };
};

/**
 * Transient pool for managing heavy or costly resources.
 */
const heavyPool = createTransientPool(2);

/**
 * Persistent pool for managing light-related resources.
 */
const lightPool = createPersistentPool();

export {
  getWorkerScriptPath,
  createPersistentPool,
  createTransientPool,
  heavyPool,
  lightPool,
  type TaskPayload,
  type QueuedTask,
  type WorkerPoolInstance
};
