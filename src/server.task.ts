import {isAsync, isPromise, timeoutFunction} from './server.helpers';
import { log } from './logger';

/**
 * Debug handler callback.
 *
 * @template TReturn Return type of the memoized function.
 *
 * @param info - Object containing debugging information.
 * @param info.type - Information debugging category.
 * @param info.value - Value associated with the debug operation.
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
 * @property [cancelMs] - Hard cutoff for cancellation (infinite if undefined)
 * @property {DeferTaskDebugHandler} [debug] - Debug callback function
 * @property [timeoutMs] - Max time for a single execution (default `1000`)
 * @property [repeat] - Number of loops (default `1`)
 * @property [errorMessage] - Custom error for timeouts
 */
interface DeferTaskOptions {
  cancelMs?: number;
  debug?: DeferTaskDebugHandler;
  timeoutMs?: number;
  repeat?: number | undefined;
  errorMessage?: string;
}

/**
 * Create a managed task that can be repeated, timed out, and stopped.
 *
 * @param func - The function or promise to be run
 * @param {DeferTaskOptions} [options={}] - Configurable options.
 */
const deferTask = <TArgs extends unknown[], TReturn>(
  func: ((...args: TArgs) => TReturn | Promise<TReturn>) | Promise<TReturn>,
  {
    cancelMs,
    debug = () => {},
    repeat = 1,
    timeoutMs,
    errorMessage = 'Task timed out'
  }: DeferTaskOptions = {}
) => {
  const updatedRepeat = typeof repeat === 'number' ? repeat : undefined;
  const updatedTimeoutMs = timeoutMs ?? 1000;
  const updatedFunc = async (...args: TArgs) =>
    (!isAsync(func) && isPromise(func) ? func as Promise<TReturn> : (func as (...args: TArgs) => TReturn | Promise<TReturn>)(...args));

  return (...args: TArgs): DeferTaskHandle<TReturn> => {
    const state: {
      isRunning: boolean;
      count: number;
      promise?: Promise<TReturn | undefined> | undefined
    } = {
      isRunning: true,
      count: 0,
      promise: undefined
    };

    // Run, repeat, or return passed func.
    const task = async (): Promise<TReturn | undefined> => {
      state.count += 1;

      const shouldRepeat = state.isRunning && (updatedRepeat === undefined || state.count < updatedRepeat);
      const startFunc = timeoutFunction(() => (state.isRunning ? updatedFunc(...args) : undefined), {
        timeout: updatedTimeoutMs,
        errorMessage
      });

      debug({
        type: 'run',
        value: () => ({ ...state })
      });

      const result = await startFunc.catch(error => {
        state.isRunning = false;

        debug({
          type: 'run:error',
          value: () => ({ ...state, error })
        });

        log.error('Defer task error', error);

        return Promise.reject(error);
      });

      if (shouldRepeat) {
        return task();
      }

      return result;
    };

    return {
      isRunning: () => {
        debug({
          type: 'isRunning',
          value: () => ({ ...state })
        });

        return state.isRunning;
      },
      start: async () => {
        state.isRunning = true;
        let updatedTask: Promise<TReturn | undefined>;

        debug({
          type: 'start',
          value: () => ({ ...state })
        });

        if (cancelMs !== undefined) {
          updatedTask = timeoutFunction(() => {
            state.isRunning = false;

            return task();
          }, { timeout: cancelMs, errorMessage: 'Task canceled' });
        } else {
          updatedTask = task();
        }

        state.promise = updatedTask;

        return state.promise;
      },
      stop: async () => {
        state.isRunning = false;

        debug({
          type: 'stop',
          value: () => ({ ...state })
        });

        await state.promise?.catch(error => {
          debug({
            type: 'stop:error',
            value: () => ({ ...state, error })
          });

          console.error('Defer task stopped with error', error);
        });
      }
    };
  };
};

export { deferTask, type DeferTaskOptions, type DeferTaskHandle, type DeferTaskDebugHandler };
