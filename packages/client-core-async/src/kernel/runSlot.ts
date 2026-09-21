import { reportAsync } from "#/kernel/reportAsync";
import { spawn } from "#/kernel/spawn";
import type { Store } from "#/kernel/store";

export interface Run<S> {
  /** Aborts when this run is superseded, ended, or the slot is disposed. */
  readonly signal: AbortSignal;
  /** `store.set`, DROPPED once this run is no longer the live one. */
  set(next: S | ((previous: S) => S)): void;
  /** Run `step` unless this run is no longer the live one — for an effect
   * the world can see that is not a state write (a callback, a fold). */
  ifCurrent(step: () => void): void;
}

export interface RunSlot<S> {
  /** End the run in flight, if any, and start `body` as the live run. A
   * no-op once disposed. */
  start(body: (run: Run<S>) => Promise<void>): void;
  /** End the run in flight, if any. */
  end(): void;
  /** End the run in flight and refuse every later `start`. Idempotent. */
  dispose(): void;
  isDisposed(): boolean;
}

/** "At most one live run" for a Store-backed machine — the RxJS `switchMap`
 * written once. `start` aborts the run in flight and begins the next under a
 * fresh signal; the run reaches the world only through its `Run`, whose
 * `set`/`ifCurrent` are dropped the moment that signal has aborted. That
 * guard is the point: an awaited resolution and a superseding `start` can
 * land in the same tick, and the continuation then runs one microtask AFTER
 * it has been superseded — an unguarded `store.set` there writes over its
 * successor's state. A failing body is rethrown on a macrotask
 * (`reportAsync`): a Store has no error channel (slice 2 ruling 8). */
export function createRunSlot<S>(store: Store<S>): RunSlot<S> {
  let active: AbortController | null = null;
  let disposed = false;

  function end(): void {
    active?.abort();
    active = null;
  }

  return {
    start: (body: (run: Run<S>) => Promise<void>) => {
      if (disposed) {
        return;
      }

      end();
      const controller = new AbortController();
      active = controller;
      const { signal } = controller;
      const run: Run<S> = {
        signal,
        set: (next: S | ((previous: S) => S)) => {
          if (!signal.aborted) {
            store.set(next);
          }
        },
        ifCurrent: (step: () => void) => {
          if (!signal.aborted) {
            step();
          }
        },
      };
      void spawn(() => {
        return body(run);
      }, reportAsync);
    },
    end,
    dispose: () => {
      disposed = true;
      end();
    },
    isDisposed: () => {
      return disposed;
    },
  };
}
