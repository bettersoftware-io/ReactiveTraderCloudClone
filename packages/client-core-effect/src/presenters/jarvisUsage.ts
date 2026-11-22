import { Effect, Stream } from "effect";
import type { ObservedValueOf } from "rxjs";

import type { JarvisUsagePort, JarvisUsagePresenter } from "@rtc/core-api";

import {
  type EffectHost,
  fromPortIn,
  listenToStateStream,
  reportOutOfBand,
  runForkIn,
} from "#/bridge/out";
import { createSyncRef } from "#/bridge/syncRef";

/** What `usage$` carries: a snapshot, or `null` before the first. */
type UsageSnapshot = ObservedValueOf<JarvisUsagePresenter["usage$"]>;

/**
 * `presenters.jarvisUsage` on the Effect core: `null` first, then the
 * port's snapshots, the latest replayed. The port is reached on the FIRST
 * subscription only and its relay is held on the host scope for the app's
 * life (the RxJS `warmReplay`), so leaving and re-entering the Ops tab
 * never re-sends the wire subscribe.
 */
export function createJarvisUsagePresenter(
  host: EffectHost,
  port: JarvisUsagePort,
): JarvisUsagePresenter {
  const ref = createSyncRef<UsageSnapshot>(null);
  let opened = false;

  function openPortOnce(): void {
    if (opened) {
      return;
    }

    opened = true;
    runForkIn(
      host.runtime,
      fromPortIn(host.scope)(port.usage$()).pipe(
        Stream.runForEach((snapshot) => {
          return Effect.sync(() => {
            ref.set(() => {
              return snapshot;
            });
          });
        }),
        // A failed usage port leaves the last snapshot showing and is
        // reported, never silently lost.
        Effect.catchCause((cause) => {
          return Effect.sync(() => {
            reportOutOfBand(cause);
          });
        }),
      ),
      host.scope,
    );
  }

  return {
    usage$: listenToStateStream((listener: (value: UsageSnapshot) => void) => {
      openPortOnce();
      return ref.listen(listener);
    }, ref.get),
  };
}
