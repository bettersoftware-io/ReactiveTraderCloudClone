import { Cause, Effect, Exit, Scope, Stream, SubscriptionRef } from "effect";

import {
  createEqWorkspaceState,
  type EqWorkspaceEvent,
  firstWatchlistSymbol,
  reduceEqWorkspace,
} from "@rtc/client-core";
import type {
  Stream as CoreStream,
  EqChartType,
  EqIndicatorId,
  EqPaneId,
  EqWorkspaceIntents,
  EqWorkspaceState,
  Machine,
} from "@rtc/core-api";
import type { CandleTimeframe, EquityInstrument } from "@rtc/domain";

import {
  createChildHost,
  type EffectHost,
  fromPortIn,
  refToWarmStateStream,
  reportOutOfBand,
  setRefIfChanged,
} from "#/bridge/out";

export interface EqWorkspaceDeps {
  /** Symbol the workspace opens with — the sole open tab and the selection.
   * Composition supplies the first watchlist symbol, or "" when the roster
   * is not known synchronously yet (WS-real). */
  readonly initialSymbol: string;
  /** The roster, for the asynchronous recovery path: the first NON-empty
   * list's first symbol seeds the workspace, once. The fold's own guard
   * makes an intervening user selection win. */
  readonly watchlist$?: CoreStream<readonly EquityInstrument[]>;
}

/** The cross-panel equities workspace singleton: the imported fold over a
 * `SubscriptionRef`, kept warm for the app's lifetime (a cold `getValue()`
 * between panel mounts must not glitch the shared selection), on a CHILD
 * host so `app.dispose()` ends it. The seed is ONE forked fiber over the
 * roster — `Stream.take(1)` after the empty-symbol filter, so an empty
 * roster never seeds and a later roster never re-seeds; a non-interrupt
 * failure of the roster has no channel on a ref and is rethrown out of band
 * (slice 2 ruling 8). */
export function createEqWorkspaceMachine(
  parent: EffectHost,
  deps: EqWorkspaceDeps,
): Machine<EqWorkspaceState, EqWorkspaceIntents> {
  const host = createChildHost(parent);
  const ref = host.runtime.runSync(
    SubscriptionRef.make<EqWorkspaceState>(
      createEqWorkspaceState(deps.initialSymbol),
    ),
  );
  const warm = refToWarmStateStream(host, ref);
  let disposed = false;

  function apply(event: EqWorkspaceEvent): void {
    if (!disposed) {
      host.runtime.runSync(
        setRefIfChanged(ref, (state) => {
          return reduceEqWorkspace(state, event);
        }),
      );
    }
  }

  function dispose(): void {
    disposed = true;
    warm.release();
    Effect.runFork(Scope.close(host.scope, Exit.void));
  }

  const roster$ = deps.watchlist$;

  if (roster$ !== undefined) {
    // Subscribed through the machine's OWN scope, so the seed fiber's
    // source is released by `dispose()` whether or not the roster ever
    // arrived.
    const roster = fromPortIn(host.scope)(roster$);
    host.runtime.runFork(
      roster.pipe(
        Stream.map(firstWatchlistSymbol),
        Stream.filter((sym) => {
          return sym !== "";
        }),
        Stream.take(1),
        Stream.runForEach((sym) => {
          return setRefIfChanged(ref, (state) => {
            return reduceEqWorkspace(state, { kind: "seed", sym });
          });
        }),
        Effect.catchAllCause((cause) => {
          return Effect.sync(() => {
            if (!Cause.isInterruptedOnly(cause)) {
              reportOutOfBand(cause);
            }
          });
        }),
      ),
      { scope: host.scope },
    );
  }

  return {
    state$: warm.state$,
    intents: {
      select: (sym: string) => {
        apply({ kind: "select", sym });
      },
      closeTab: (sym: string) => {
        apply({ kind: "closeTab", sym });
      },
      setTimeframe: (tf: CandleTimeframe) => {
        apply({ kind: "setTimeframe", timeframe: tf });
      },
      setChartType: (kind: EqChartType) => {
        apply({ kind: "setChartType", chartType: kind });
      },
      toggleIndicator: (id: EqIndicatorId) => {
        apply({ kind: "toggleIndicator", id });
      },
      togglePane: (id: EqPaneId) => {
        apply({ kind: "togglePane", id });
      },
      toggleYScale: () => {
        apply({ kind: "toggleYScale" });
      },
      setCompare: (sym: string | null) => {
        apply({ kind: "setCompare", sym });
      },
    },
    dispose,
  };
}
