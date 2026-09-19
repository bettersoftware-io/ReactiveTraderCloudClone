/** Let every continuation a core may have scheduled run before the next
 * assertion: the microtask queue, then one macrotask turn, twice over.
 *
 * The contract asserts the FIRST value of a subscription synchronously —
 * that is the warmth guarantee — and every later value only after this
 * call. That split is the envelope's actual promise: an rxjs Subject
 * delivers in the caller's tick, an Effect fiber delivers on the scheduler
 * (measured on 3.22.2: a port's first value one microtask after `runFork`,
 * later ones a macrotask later), and a suite that asserted synchronously
 * after a `set` would be pinning RxJS's delivery timing, not the behaviour.
 * Two turns cover a two-hop chain (port → fold → subscriber); a suite that
 * needs more is asserting on something the envelope does not promise.
 *
 * Deliberately the REAL `setTimeout`: a suite that installs vitest fake
 * timers must drive them itself (`vi.advanceTimersByTimeAsync`) — the
 * clock under test must not be the clock this waits on. */
export async function settle(): Promise<void> {
  for (let turn = 0; turn < 2; turn += 1) {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
