import type {
  EqChartType,
  EqIndicatorId,
  EqPaneId,
  EqWorkspaceIntents,
  EqWorkspaceState,
  Machine,
  Stream,
} from "@rtc/core-api";
import {
  createEqWorkspaceState,
  type EqWorkspaceEvent,
  firstWatchlistSymbol,
  reduceEqWorkspace,
} from "@rtc/core-logic";
import type { CandleTimeframe, EquityInstrument } from "@rtc/domain";

import { relay } from "#/bridge/in";
import { storeToWarmStateStream } from "#/bridge/out";
import { reportAsync } from "#/kernel/reportAsync";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

export interface EqWorkspaceDeps {
  readonly initialSymbol: string;
  readonly watchlist$?: Stream<readonly EquityInstrument[]>;
}

/** Cross-panel equities workspace state: the imported fold over a Store,
 * warm for the app's lifetime, seeded from `deps.initialSymbol` and — while
 * still unseeded — from the first non-empty watchlist roster to arrive. */
export function createEqWorkspaceMachine(
  deps: EqWorkspaceDeps,
  lifetime: AbortSignal,
): Machine<EqWorkspaceState, EqWorkspaceIntents> {
  const store = createStore<EqWorkspaceState>(
    createEqWorkspaceState(deps.initialSymbol),
  );
  const warm = storeToWarmStateStream(store);
  let disposed = false;

  function apply(event: EqWorkspaceEvent): void {
    if (!disposed) {
      store.set((state) => {
        return reduceEqWorkspace(state, event);
      });
    }
  }

  const seeding = new AbortController();
  const watchlist$ = deps.watchlist$;

  // ONE relay, kept for the machine's lifetime, guarded by a flag: aborting
  // from inside the callback would strand the subscription when the first
  // roster arrives synchronously (relay registers its abort listener after
  // `subscribe` returns). The fold's own guard makes a user selection win.
  if (watchlist$ !== undefined) {
    let seeded = false;
    void spawn(() => {
      return relay(watchlist$, seeding.signal, (list) => {
        const sym = firstWatchlistSymbol(list);

        if (!seeded && sym !== "") {
          seeded = true;
          apply({ kind: "seed", sym });
        }
      });
    }, reportAsync);
  }

  function dispose(): void {
    disposed = true;
    seeding.abort();
    warm.release();
  }

  lifetime.addEventListener("abort", dispose, { once: true });

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
