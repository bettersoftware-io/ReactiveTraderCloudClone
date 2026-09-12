import { type StateObservable, state } from "@rx-state/core";
import { merge } from "rxjs";
import { distinctUntilChanged, map, scan, startWith } from "rxjs/operators";

import type { StaleFlagDeps } from "@rtc/core-api";
import { ConnectionStatus } from "@rtc/domain";

import type { ReadOnlyMachine } from "./machine";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { StaleFlagDeps };

type Event<T> =
  | { kind: "status"; status: ConnectionStatus }
  | { kind: "value"; value: T };

interface Acc<T> {
  /** Latched the moment status leaves CONNECTED; cleared on reconnect. */
  wasDisconnected: boolean;
  /** Most recent value reference seen on value$. */
  current: T | undefined;
  /** Whether a value has been seen at all (so `current` is meaningful). */
  hasValue: boolean;
  /** The value reference held at the last reconnect. */
  valueAtReconnect: T | undefined;
  /** The derived flag. */
  stale: boolean;
}

export function createStaleFlagMachine<T>(
  deps: StaleFlagDeps<T>,
): ReadOnlyMachine<boolean> {
  const events$ = merge(
    deps.status$.pipe(
      map((status): Event<T> => {
        return { kind: "status", status };
      }),
    ),
    deps.value$.pipe(
      map((value): Event<T> => {
        return { kind: "value", value };
      }),
    ),
  );

  const initial: Acc<T> = {
    wasDisconnected: false,
    current: undefined,
    hasValue: false,
    valueAtReconnect: undefined,
    stale: false,
  };

  const stream$ = events$.pipe(
    scan((acc: Acc<T>, event: Event<T>): Acc<T> => {
      if (event.kind === "status") {
        if (event.status !== ConnectionStatus.CONNECTED) {
          // Mirrors effect 1's `wasDisconnectedRef.current = true` branch.
          return { ...acc, wasDisconnected: true };
        }

        // CONNECTED: if we had previously disconnected, this is the reconnect —
        // snapshot the current value reference and go stale.
        if (acc.wasDisconnected) {
          return {
            ...acc,
            wasDisconnected: false,
            valueAtReconnect: acc.current,
            stale: true,
          };
        }

        return acc;
      }

      // value event: record the new reference; if stale and the reference
      // differs from the one captured at reconnect, fresh data has arrived —
      // clear the flag (mirrors effect 2).
      const next: Acc<T> = {
        ...acc,
        current: event.value,
        hasValue: true,
      };

      if (acc.stale && event.value !== acc.valueAtReconnect) {
        next.stale = false;
      }

      return next;
    }, initial),
    map((acc) => {
      return acc.stale;
    }),
    // Seed the default `false` here (not as state()'s separate default) so the
    // scan's own identical first `false` is collapsed by distinctUntilChanged —
    // otherwise state() would replay its default AND the stream's first false.
    // Precondition for copying this idiom: it is only needed when the default
    // value can be structurally equal to the stream's first emission (here,
    // `false`). Machines whose default differs from their first real state
    // (e.g. an object READY) can use `state(stream$, DEFAULT)` directly.
    startWith(false),
    distinctUntilChanged(),
  );

  const state$: StateObservable<boolean> = state(stream$);

  // Keep state$ warm so it carries its default before useMachine first renders.
  const warm = state$.subscribe();

  return {
    state$,
    intents: {},
    dispose: () => {
      warm.unsubscribe();
    },
  };
}
