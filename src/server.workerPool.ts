import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { availableParallelism } from 'node:os';

interface TaskPayload {
  moduleSpecifier: string;
  exportName?: string;
  args?: unknown;
  options?: unknown;
  session?: unknown;
}

interface QueuedTask {
  payload: TaskPayload;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
}

/**
 * Throttled worker thread pool for parallel execution.
 */
class WorkerPool {
  private maxWorkers: number;
  private activeWorkers = 0;
  private queue: QueuedTask[] = [];
  private workerScript: string;

  /**
   * Create a new WorkerPool.
   *
   * @param {number} [maxWorkers] - Maximum active threads.
   */
  constructor(maxWorkers = Math.max(1, availableParallelism() - 1)) {
    this.maxWorkers = maxWorkers;
    try {
      this.workerScript = fileURLToPath(import.meta.resolve('#workerEntry'));
    } catch {
      // Fallback for Jest test environments to point to the compiled dist worker entry
      this.workerScript = new URL('../dist/server.workerEntry.js', import.meta.url).pathname;
    }
  }

  /**
   * Enqueues and runs a task in an on-demand worker thread.
   *
   * @param {TaskPayload} payload - The task configuration and payload.
   * @returns {Promise<T>} Promise resolving to the worker output.
   */
  public runTask<T>(payload: TaskPayload): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ payload, resolve, reject });

      this.next();
    });
  }

  private next(): void {
    if (this.activeWorkers >= this.maxWorkers || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();

    if (!task) {
      return;
    }

    this.activeWorkers += 1;

    this.spawnWorker(task);
  }

  private spawnWorker(task: QueuedTask): void {
    const { payload, resolve, reject } = task;

    try {
      const worker = new Worker(this.workerScript, {
        workerData: payload
      });

      let resolved = false;

      worker.on('message', message => {
        resolved = true;

        if (message.success) {
          resolve(message.payload);
        } else {
          const err = new Error(message.error?.message || String(message.error));

          if (message.error?.stack) {
            err.stack = message.error.stack;
          }

          reject(err);
        }
      });

      worker.on('error', err => {
        resolved = true;

        reject(err);
      });

      worker.on('exit', code => {
        this.activeWorkers -= 1;

        if (!resolved && code !== 0) {
          reject(new Error(`Worker exited unexpectedly with code ${code}`));
        }

        // Trigger the next queued task
        this.next();
      });
    } catch (error) {
      this.activeWorkers -= 1;

      reject(error);

      this.next();
    }
  }
}

const globalWorkerPool = new WorkerPool();

export {
  WorkerPool,
  globalWorkerPool,
  type TaskPayload
};
