import type { Stream } from "@rtc/core-api";

import { topicFromObservable } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";

/** Per-key port streams, memoised: `open(key)` is called once, at the first
 * request for that key, and the result is a replay-1 Topic that subscribes
 * the port on its first subscriber and RELEASES it on its last — a
 * per-symbol stream is refcounted on the server, so it must let go when its
 * symbol is deselected (`warmReplay`'s own rule). */
export function createKeyedPortStreams<T>(
  open: (key: string) => Stream<T>,
): (key: string) => Stream<T> {
  const cache = new Map<string, Stream<T>>();

  return (key: string) => {
    const cached = cache.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const stream = topicToStream(topicFromObservable(open(key)));
    cache.set(key, stream);
    return stream;
  };
}
