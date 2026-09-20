import type { Topic } from "#/kernel/topic";

/** Subscribe a Topic on behalf of a producer until `signal` aborts: every
 * value goes to `next`; the source failing, or `next` throwing, rejects —
 * a producer's own consumption of another topic is OPERATOR code, so its
 * failure fails the producer (`mapTopic`'s projection rule), never an
 * isolated report. Released SYNCHRONOUSLY on abort, matching the refCount
 * contract's own synchronous release — the `finally`-after-race shape is a
 * few microtasks late, late enough to fail a caller that checks release
 * state right after unsubscribing. Resolves on abort (that is a producer's
 * success, as `untilAborted` says). */
export function relayTopic<T>(
  source: Topic<T>,
  signal: AbortSignal,
  next: (value: T) => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    // No initializer: an assignment target, not a function-expression
    // binding (`func-style`) — assigned synchronously below. A replayed
    // value can reach `fail` DURING `subscribe`, before this is set; the
    // `stop?.()` there is a no-op then and the `if (failed)` after the
    // subscribe call releases the source instead.
    let stop: (() => void) | undefined;
    let failed = false;

    function fail(error: unknown): void {
      failed = true;
      reject(error);
      stop?.();
    }

    stop = source.subscribe((value) => {
      try {
        next(value);
      } catch (error) {
        fail(error);
      }
    }, fail);

    if (failed) {
      stop();
      return;
    }

    signal.addEventListener(
      "abort",
      () => {
        stop?.();
        resolve();
      },
      { once: true },
    );
  });
}
