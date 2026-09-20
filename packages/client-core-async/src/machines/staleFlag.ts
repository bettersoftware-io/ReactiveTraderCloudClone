import {
  createStaleFlagAcc,
  reduceStaleFlag,
  type StaleFlagEvent,
} from "@rtc/client-core";
import type { ReadOnlyMachine, Stream } from "@rtc/core-api";
import type { ConnectionStatus } from "@rtc/domain";

import { relay } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { reportAsync } from "#/kernel/reportAsync";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

export interface StaleFlagDeps<T> {
  status$: Stream<ConnectionStatus>;
  value$: Stream<T>;
}

/** The stale-flag fold (the RxJS core's reducer, imported) over a Store:
 * warm from creation — both sources are relayed at once, as the RxJS
 * `state$.subscribe()` does — and ended by `dispose()`. The Store's
 * equal-write drop is the `distinctUntilChanged`. A source failure has no
 * channel on a Store: it aborts the machine and is rethrown on a macrotask
 * (slice 2 ruling 8). */
export function createStaleFlagMachine<T>(
  deps: StaleFlagDeps<T>,
): ReadOnlyMachine<boolean> {
  const store = createStore(false);
  const controller = new AbortController();
  let acc = createStaleFlagAcc<T>();

  function apply(event: StaleFlagEvent<T>): void {
    acc = reduceStaleFlag(acc, event);
    store.set(acc.stale);
  }

  void spawn(async () => {
    try {
      await Promise.all([
        relay(deps.status$, controller.signal, (status) => {
          apply({ kind: "status", status });
        }),
        relay(deps.value$, controller.signal, (value) => {
          apply({ kind: "value", value });
        }),
      ]);
    } catch (error) {
      controller.abort();
      throw error;
    }
  }, reportAsync);

  return {
    state$: storeToStateStream(store),
    intents: {},
    dispose: () => {
      controller.abort();
    },
  };
}
