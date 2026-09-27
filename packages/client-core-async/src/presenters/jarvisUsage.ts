import type { ObservedValueOf } from "rxjs";

import type { JarvisUsagePort, JarvisUsagePresenter } from "@rtc/core-api";

import { relay } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";
import { createTopic } from "#/kernel/topic";

/** What `usage$` carries: a snapshot, or `null` before the first. */
type UsageSnapshot = ObservedValueOf<JarvisUsagePresenter["usage$"]>;

/**
 * `presenters.jarvisUsage` on the async core: `null` first, then the port's
 * snapshots, the latest replayed to a late subscriber. The port is reached
 * on the first subscription only and held for the app's life (the RxJS
 * `warmReplay`), so leaving and re-entering the Admin tab never re-sends the
 * wire subscribe.
 */
export function createJarvisUsagePresenter(
  port: JarvisUsagePort,
  lifetime: AbortSignal,
): JarvisUsagePresenter {
  const usage = createTopic<UsageSnapshot>(
    (signal, publish) => {
      publish(null);
      return relay(port.usage$(), signal, publish);
    },
    { replay: true, retainUntil: lifetime },
  );

  return { usage$: topicToStream(usage) };
}
