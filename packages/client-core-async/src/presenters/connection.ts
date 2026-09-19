import type { ConnectionStatusPresenter } from "@rtc/core-api";
import {
  type ConnectionEventsPort,
  ConnectionStatus,
  nextConnectionStatus,
} from "@rtc/domain";

import { relay } from "#/bridge/in";
import { topicToStream } from "#/bridge/out";
import { createTopic } from "#/kernel/topic";

/** `status$` is the fold of the connection-events port over
 * `nextConnectionStatus`, as a replay-1 refCounted Topic. The first
 * subscriber starts the fold, which publishes `initial` synchronously (the
 * RxJS core's `startWith`) and then one state per event — every event, as
 * `scan` does, even when the state did not change. The last unsubscribe
 * abandons the fold, so a fresh subscriber starts over from `initial`. The
 * fold state is a producer-local `let`: it can only ever belong to one warm
 * period. */
export function createConnectionPresenter(
  events: ConnectionEventsPort,
  initial: ConnectionStatus = ConnectionStatus.CONNECTING,
): ConnectionStatusPresenter {
  const status = createTopic<ConnectionStatus>(
    (signal, publish) => {
      let current = initial;
      publish(current);
      return relay(events.events(), signal, (event) => {
        current = nextConnectionStatus(current, event);
        publish(current);
      });
    },
    { replay: true },
  );

  return { status$: topicToStream(status) };
}
