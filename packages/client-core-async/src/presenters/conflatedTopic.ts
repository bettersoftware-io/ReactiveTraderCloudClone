import type { Observable } from "rxjs";

import type { Stream } from "@rtc/core-api";

import { relay } from "#/bridge/in";
import { sleep } from "#/kernel/sleep";
import { createTopic, type Topic } from "#/kernel/topic";

/** A value waiting for the window's end, boxed so `null` means "nothing
 * pending" even for a source that emits `null`. */
interface Pending<T> {
  readonly value: T;
}

/** The RxJS core's `conflateWhen(flag$, ms)` restated as one producer: a
 * leading+trailing throttle gated by the calm flag. While calm, a value
 * arriving with no window open is published at once and opens a window of
 * `ms`; values inside the window replace a pending slot; at the window's end
 * the pending value (if any) is published and a new window opens — so a
 * steady feed yields one value per `ms`. While not calm, every value passes.
 * A flag flip takes effect at once: calm → off closes the window and drops
 * its pending value (the RxJS `switchMap` unsubscribes the throttled inner);
 * off → calm starts fresh. Values before the flag has emitted are dropped
 * (there is no inner yet). Replay-1 + refCount, like every presenter
 * stream; the window timer dies with the run. */
export function createConflatedTopic<T>(
  source: Observable<T>,
  calm$: Stream<boolean>,
  ms: number,
): Topic<T> {
  return createTopic<T>(
    async (signal, publish) => {
      let calm: boolean | null = null;
      let pending: Pending<T> | null = null;
      let window: AbortController | null = null;

      function closeWindow(): void {
        window?.abort();
        window = null;
        pending = null;
      }

      function openWindow(): void {
        const controller = new AbortController();
        window = controller;
        void sleep(ms, controller.signal).then(
          () => {
            if (window !== controller) {
              return;
            }

            window = null;

            if (pending !== null) {
              const { value } = pending;
              pending = null;
              publish(value);
              openWindow();
            }
          },
          () => {
            // A closed window is silent: its abort is the normal end.
          },
        );
      }

      signal.addEventListener("abort", closeWindow, { once: true });

      await Promise.race([
        relay(calm$, signal, (on) => {
          calm = on;

          if (!on) {
            closeWindow();
          }
        }),
        relay(source, signal, (value) => {
          if (calm === null) {
            return;
          }

          if (!calm) {
            publish(value);
            return;
          }

          if (window === null) {
            publish(value);
            openWindow();
            return;
          }

          pending = { value };
        }),
      ]);
    },
    { replay: true },
  );
}
