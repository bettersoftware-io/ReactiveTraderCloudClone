/** Resolve when `signal` aborts — immediately if it already has. The natural
 * end of a producer whose work is entirely in callbacks (a relay of a hot
 * port, a derived topic): it has nothing to await but its own cancellation.
 * Resolves rather than rejecting because abort is that producer's success,
 * not its failure — `spawn` would swallow an `AbortError` anyway, but a
 * `finally` reads better after a resolution than after a caught rejection. */
export function untilAborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    signal.addEventListener(
      "abort",
      () => {
        resolve();
      },
      { once: true },
    );
  });
}
