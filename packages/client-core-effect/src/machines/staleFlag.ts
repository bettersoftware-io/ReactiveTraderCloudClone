import { Cause, Effect, Exit, Scope, Stream, SubscriptionRef } from "effect";

import {
  createStaleFlagAcc,
  reduceStaleFlag,
  type StaleFlagAcc,
  type StaleFlagEvent,
} from "@rtc/client-core";
import type { Stream as CoreStream, ReadOnlyMachine } from "@rtc/core-api";
import type { ConnectionStatus } from "@rtc/domain";

import {
  createDetachedHost,
  fromPortIn,
  refToStateStream,
  reportOutOfBand,
  setRefIfChanged,
} from "#/bridge/out";

export interface StaleFlagDeps<T> {
  status$: CoreStream<ConnectionStatus>;
  value$: CoreStream<T>;
}

/** The stale-flag fold (the RxJS core's reducer, imported) as
 * `Stream.runFoldEffect` over the merged sources, writing the flag through
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
  const events = Stream.merge(
    fromPort(deps.status$).pipe(
      Stream.map((status): StaleFlagEvent<T> => {
        return { kind: "status", status };
      }),
    ),
    fromPort(deps.value$).pipe(
      Stream.map((value): StaleFlagEvent<T> => {
        return { kind: "value", value };
      }),
    ),
  );

  function close(): void {
    Effect.runFork(Scope.close(host.scope, Exit.void));
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
