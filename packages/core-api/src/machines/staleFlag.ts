import type { ConnectionStatus } from "@rtc/domain";

import type { Stream } from "#/stream";

/** Generic stale-detection derived flag, relocated out of the old
 * useStaleDetection React hook. It has NO intents — it's a pure read-only
 * derivation over the connection status and the watched value stream. Two
 * consumers wire it: the price stream per tile, and the analytics position
 * stream.
 *
 * The rule (reproduced exactly from the old hook, reference-equality and all):
 * latch `wasDisconnected` whenever status leaves CONNECTED; on the reconnect
 * (status returns to CONNECTED while latched) record the value reference held
 * at that moment (`valueAtReconnect`) and go stale; the flag CLEARS the moment
 * a new value reference (!==) arrives after reconnect; while connected and
 * never-disconnected it is never stale. Same-reference re-emissions after
 * reconnect are NOT new data, so the flag stays stale. */
export interface StaleFlagDeps<T> {
  status$: Stream<ConnectionStatus>;
  value$: Stream<T>;
}
