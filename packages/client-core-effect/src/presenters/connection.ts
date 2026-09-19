// packages/client-core-effect/src/presenters/connection.ts
import { Option, Stream } from "effect";

import type { ConnectionStatusPresenter } from "@rtc/core-api";
import {
  type ConnectionEventsPort,
  ConnectionStatus,
  nextConnectionStatus,
} from "@rtc/domain";

import {
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  sharedFold,
} from "#/bridge/out";

/** `status$` is the fold of the connection-events port over
 * `nextConnectionStatus` as a `sharedFold`: seeded with `initial` on every
 * first subscribe (the RxJS core's `startWith`, and what makes a fresh
 * subscriber after teardown start over), driven by a fiber that runs the
 * port through `Stream.runForEach` for the whole warm period. */
export function createConnectionPresenter(
  host: EffectHost,
  events: ConnectionEventsPort,
  initial: ConnectionStatus = ConnectionStatus.CONNECTING,
): ConnectionStatusPresenter {
  // Called ONCE, here — every warm period re-subscribes this Observable.
  const source = events.events();

  return {
    status$: sharedFold(host, {
      seed: () => {
        return Option.some(initial);
      },
      run: (update: FoldUpdate<ConnectionStatus>, fromPort: FromPort) => {
        return fromPort(source).pipe(
          Stream.runForEach((event) => {
            return update((current) => {
              return nextConnectionStatus(
                Option.getOrElse(current, () => {
                  return initial;
                }),
                event,
              );
            });
          }),
        );
      },
    }),
  };
}
