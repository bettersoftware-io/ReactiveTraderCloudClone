// packages/client-core-effect/src/presenters/connection.ts
import { Stream } from "effect";

import type { ConnectionStatusPresenter } from "@rtc/core-api";
import {
  type ConnectionEventsPort,
  ConnectionStatus,
  nextConnectionStatus,
} from "@rtc/domain";

import { fromObservable } from "#/bridge/in";
import { type EffectHost, type FoldUpdate, sharedFold } from "#/bridge/out";

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
  return {
    status$: sharedFold(host, {
      seed: () => {
        return initial;
      },
      run: (update: FoldUpdate<ConnectionStatus>) => {
        return fromObservable(events.events()).pipe(
          Stream.runForEach((event) => {
            return update((current) => {
              return nextConnectionStatus(current, event);
            });
          }),
        );
      },
    }),
  };
}
