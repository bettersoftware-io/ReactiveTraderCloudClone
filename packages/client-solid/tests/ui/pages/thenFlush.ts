import { flush } from "solid-js";

/** Wraps `handler` so every call is followed by Solid's `flush()` — what a
 * browser's task boundary between two input events does. Solid 2 applies a
 * write at the next microtask, so a test that calls a hook's handlers
 * directly (pointerdown, then pointermove, in one synchronous turn) would
 * otherwise hand the second handler the state from before the first, and
 * read the hook's accessors before either landed. (DOM events a test FIRES
 * get the same treatment from tests/setup/flush-after-each-event.ts.) */
export function thenFlush<A extends unknown[]>(
  handler: (...args: A) => void,
): (...args: A) => void {
  return (...args: A): void => {
    handler(...args);
    flush();
  };
}
