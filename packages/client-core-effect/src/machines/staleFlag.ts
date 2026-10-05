import { Cause, Effect, Stream } from "effect";

import type { Stream as CoreStream, ReadOnlyMachine } from "@rtc/core-api";
import {
  createStaleFlagAcc,
  reduceStaleFlag,
  type StaleFlagAcc,
  type StaleFlagEvent,
} from "@rtc/core-logic";
import type { ConnectionStatus } from "@rtc/domain";

import {
  closeScope,
  createDetachedHost,
  fromPortIn,
  portEvents,
  reportOutOfBand,
} from "#/bridge/out";
import { createSyncRef } from "#/bridge/syncRef";

export interface StaleFlagDeps<T> {
  status$: CoreStream<ConnectionStatus>;
  value$: CoreStream<T>;
}

/** The stale-flag fold (the RxJS core's reducer, imported) as
 * `Stream.runFoldEffect` over both sources as one stream of events
 * (`fromPort.merged`: one queue, in emission order), writing the flag to a
 * `SyncRef` (an unchanged write is dropped — the `distinctUntilChanged`).
 * Both ports are subscribed
 * at once through the machine's own `fromPortIn` — warm from creation, as
 * the RxJS `state$.subscribe()` is — and released when `dispose()` closes
 * the scope. A source failure has no channel on a ref: the machine's scope
 * closes and the cause is rethrown out of band (slice 2 ruling 8). */
export function createStaleFlagMachine<T>(
  deps: StaleFlagDeps<T>,
): ReadOnlyMachine<boolean> {
  const host = createDetachedHost();
  const ref = createSyncRef(false);
  const fromPort = fromPortIn(host.scope);
  const events = fromPort.merged<StaleFlagEvent<T>>([
    portEvents(deps.status$, (status: ConnectionStatus) => {
      return { kind: "status", status };
    }),
    portEvents(deps.value$, (value: T) => {
      return { kind: "value", value };
    }),
  ]);

  function close(): void {
    closeScope(host.scope);
  }

  host.runtime.runFork(
    Stream.runFoldEffect(
      events,
      createStaleFlagAcc<T>(),
      (acc: StaleFlagAcc<T>, event) => {
        const next = reduceStaleFlag(acc, event);
        return ref
          .write(() => {
            return next.stale;
          })
          .pipe(Effect.as(next));
      },
    ).pipe(
      Effect.catchAllCause((cause) => {
        return Effect.sync(() => {
          if (!Cause.isInterruptedOnly(cause)) {
            close();
            reportOutOfBand(cause);
          }
        });
      }),
    ),
    { scope: host.scope },
  );

  return {
    state$: ref.stateStream(),
    intents: {},
    dispose: close,
  };
}
