import { isAsync, isPromise, timeoutFunction } from './server.helpers';
import { log } from './logger';

/**
 * Debug handler callback invoked for deferTask lifecycle events.
 *
 * @template TReturn Return type of the memoized function.
 *
 * @param info - Event payload. Object containing debugging information.
 * @param info.type - Information debugging category. Available options:
 *   `start` | `run` | `run:stopped` | `run:error` | `run:cancel` | `stop`
 *   | `stop:error` | `isRunning`
 * @param info.value - Returns a snapshot of internal-state (`isRunning`,
 *   `count`, and optionally `error`).
 * @param {MemoCache<TReturn>} info.cache - MemoCache array
 */
type DeferTaskDebugHandler = (info: { type: string; value: unknown; [key: string]: unknown; }) => void;

/**
 * Handle for managing the deferred task's lifecycle.
 *
 * @interface DeferTaskHandle
 *
 * @property isRunning - Returns the current running state of the task.
 * @property start - Starts the task and returns the final result promise, after repeating.
 * @property stop - Stops the task and awaits its current execution/cleanup.
 */
interface DeferTaskHandle<TReturn> {
  isRunning: () => boolean;
  start: () => Promise<TReturn | undefined>;
  stop: () => Promise<void>;
}

/**
 * Options for the deferred task.
 *
 * @property [cancelMs] - Hard ms cutoff for cancellation. `undefined`
 *     disables the cutoff. (default `undefined`)
 * @property {DeferTaskDebugHandler} [debug] - Debug callback for lifecycle events.
 *     See {@link deferTask}.
 * @property [timeoutMs] - Max time for a single execution cycle. (default `1000`)
 * @property [repeat] - Number of loops. (default `1`)
 */
interface DeferTaskOptions {
  cancelMs?: number;
  debug?: DeferTaskDebugHandler;
  timeoutMs?: number;
  repeat?: number | undefined;
}

/**
 * Minimum delay ms allowed for {@link DeferTaskOptions.timeoutMs} for repeating
 * tasks.
 */
const MIN_TIMEOUT_MS = 250;

/**
 * Create a managed, repeatable, cancellable task wrapper.
 *
 * Wraps a function (sync or async) or a raw Promise and returns a *factory*.
 * Calling it with the wrapped function's arguments produces a {@link DeferTaskHandle}
 * exposing `start()`, `stop()`, and `isRunning()`.
 *
 * Options:
 * - `repeat`: number of executions. Defaults to `1`. Pass `undefined` to repeat
 *   **indefinitely** until `stop()` is called, `cancelMs` fires, or the task throws.
 * - `timeoutMs`: per-execution cycle duration. Defaults to `1000` ms.
 * - `cancelMs`: hard cutoff across the entire `start()` lifetime. `undefined` (default)
 *   disables the cutoff. When it fires, `start()` rejects with `'Task canceled'` and
 *   emits a `run:cancel` debug event.
 * - `debug`: callback invoked for lifecycle events. Emitted `type` values:
 *   `start`, `run`, `run:stopped`, `run:error`, `run:cancel`, `stop`, `stop:error`,
 *   `isRunning`. `info.value` is a thunk returning a snapshot of internal state.
 *
 * @template TArgs Tuple of arguments forwarded to `func` on each execution.
 * @template TReturn Resolved value type of `func`.
 *
 * @param func Function (sync or async) or a Promise to execute. When a Promise is
 *     provided, it is awaited on each repetition (i.e. the same settled value is
 *     reused).
 * @param {DeferTaskOptions} options Optional {@link DeferTaskOptions} controlling
 *     repeat, timeout, cancel, and debug behavior.
 * @returns A factory `(...args: TArgs) => DeferTaskHandle<TReturn>`. Each
 *     invocation produces an independent handle with its own running state.
 *
 * @example Basic use
 * const handle = deferTask(pollFunc, { repeat: undefined, timeoutMs: 5000 })(passedArgsToPollFunc);
 * // Start the task
 * void handle.start();
 * // Stop the task
 * await handle.stop();
 */
const deferTask = <TArgs extends unknown[], TReturn>(
  func: ((...args: TArgs) => TReturn | Promise<TReturn>) | Promise<TReturn>,
  {
    cancelMs,
    debug = () => {},
    repeat = 1,
    timeoutMs = 1000
  }: DeferTaskOptions = {}
) => {
  const updatedRepeat = typeof repeat === 'number' ? repeat : undefined;

  if (updatedRepeat !== 1 && (!Number.isFinite(timeoutMs) || timeoutMs < MIN_TIMEOUT_MS)) {
    throw new Error(`deferTask: timeoutMs must be >= ${MIN_TIMEOUT_MS}ms received ${timeoutMs} instead`);
  }

  const taskFunc = async (...args: TArgs): Promise<TReturn> =>
    (!isAsync(func) && isPromise(func) ? func as Promise<TReturn> : (func as (...args: TArgs) => TReturn | Promise<TReturn>)(...args));

  return (...args: TArgs): DeferTaskHandle<TReturn> => {
    const state = {
      isRunning: true,
      count: 0,
      promise: undefined as Promise<TReturn | undefined> | undefined,
      delayTimer: undefined as NodeJS.Timeout | undefined,
      resolveDelay: undefined as (() => void) | undefined
    };

    const delay = (ms: number) => new Promise<void>(resolve => {
      state.resolveDelay = () => {
        clearTimeout(state.delayTimer);
        state.delayTimer = undefined;
        state.resolveDelay = undefined;
        resolve();
      };

      state.delayTimer = setTimeout(state.resolveDelay, ms).unref();
    });

    const getJittered = () => timeoutMs * (0.9 + Math.random() * 0.2);

    const task = async (): Promise<TReturn | undefined> => {
      await delay(getJittered());

      let result: TReturn | undefined;

      while (state.isRunning && (updatedRepeat === undefined || state.count < updatedRepeat)) {
        const pacing = delay(getJittered());

        debug({
          type: 'run',
          value: () => ({ ...state })
        });

        state.count += 1;

        result = await taskFunc(...args).catch(error => {
          state.isRunning = false;

          debug({
            type: 'run:error',
            value: () => ({ ...state, error })
          });

          log.error('Defer task error', error);

          throw error;
        });

        if (state.isRunning && (updatedRepeat === undefined || state.count < updatedRepeat)) {
          await pacing;
        }
      }

      if (!state.isRunning) {
        debug({
          type: 'run:stopped',
          value: () => ({ ...state })
        });
      }

      return result;
    };

    return {
      isRunning: () => {
        debug({ type: 'isRunning', value: () => ({ ...state }) });

        return state.isRunning;
      },
      start: async () => {
        state.isRunning = true;

        debug({
          type: 'start',
          value: () => ({ ...state })
        });

        const run = async () => {
          const response = await task();

          state.isRunning = false;

          return response;
        };

        if (cancelMs === undefined) {
          state.promise = run();
        } else {
          state.promise = timeoutFunction(run, { timeout: cancelMs, errorMessage: 'Task canceled' })
            .catch(error => {
              state.isRunning = false;

              debug({
                type: 'run:cancel',
                value: () => ({ ...state, error })
              });

              log.error('Defer task canceled', error);

              throw error;
            });
        }

        return state.promise;
      },
      stop: async () => {
        state.isRunning = false;
        state.resolveDelay?.();

        debug({
          type: 'stop',
          value: () => ({ ...state })
        });

        await state.promise?.catch(error => {
          debug({
            type: 'stop:error',
            value: () => ({ ...state, error })
          });

          log.error('Defer task stopped with error', error);
        });
      }
    };
  };
};

export { deferTask, type DeferTaskOptions, type DeferTaskHandle, type DeferTaskDebugHandler, MIN_TIMEOUT_MS };
