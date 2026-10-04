import { Cause, Effect, Stream, SubscriptionRef } from "effect";

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
  refToStateStream,
  reportOutOfBand,
  setRefIfChanged,
} from "#/bridge/out";

export interface StaleFlagDeps<T> {
  status$: CoreStream<ConnectionStatus>;
  value$: CoreStream<T>;
}

/** The stale-flag fold (the RxJS core's reducer, imported) as
 * `Stream.runFoldEffect` over both sources as one stream of events
 * (`fromPort.merged`: one queue, in emission order), writing the flag through
 * `setRefIfChanged` (the `distinctUntilChanged`). Both ports are subscribed
 * at once through the machine's own `fromPortIn` — warm from creation, as
 * the RxJS `state$.subscribe()` is — and released when `dispose()` closes
 * the scope. A source failure has no channel on a ref: the machine's scope
 * closes and the cause is rethrown out of band (slice 2 ruling 8). */
export function createStaleFlagMachine<T>(
  deps: StaleFlagDeps<T>,
): ReadOnlyMachine<boolean> {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(SubscriptionRef.make(false));
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
        return setRefIfChanged(ref, () => {
          return next.stale;
        }).pipe(Effect.as(next));
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
    state$: refToStateStream(host, ref),
    intents: {},
    dispose: close,
  };
}
