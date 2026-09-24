import { createLayoutReducer, layoutStaticIds } from "@rtc/client-core";
import type {
  LayoutIntents,
  LayoutState,
  Machine,
  PanelId,
} from "@rtc/core-api";

import { storeToWarmStateStream } from "#/bridge/out";
import { createStore, type Store } from "#/kernel/store";

/** One tab's layout machine: a `Store` folded by the SHARED layout reducer
 * (`@rtc/client-core`'s `createLayoutReducer` — the RxJS core folds the very
 * same function), so every intent has committed by the time it returns (the
 * workspace's synchronous-fold contract). `seed` is the persisted tree a
 * first-opened tab starts from; `reset()` still returns `initial`. The
 * Store drops an `Object.is`-equal write, as `state()` drops a repeat. */
export interface LayoutMachine extends Machine<LayoutState, LayoutIntents> {
  readonly store: Store<LayoutState>;
}

export function createLayoutMachine(
  initial: LayoutState,
  seed: LayoutState | undefined,
  lifetime: AbortSignal,
): LayoutMachine {
  const reduce = createLayoutReducer(initial, layoutStaticIds(initial));
  const store = createStore<LayoutState>(seed ?? initial);
  const warm = storeToWarmStateStream(store);
  let disposed = false;

  function apply(event: Parameters<typeof reduce>[1]): void {
    if (disposed) {
      return;
    }

    store.set((state) => {
      return reduce(state, event);
    });
  }

  function dispose(): void {
    if (disposed) {
      return;
    }

    disposed = true;
    warm.release();
  }

  lifetime.addEventListener("abort", dispose, { once: true });

  return {
    store,
    state$: warm.state$,
    intents: {
      maximize: (id: PanelId) => {
        apply({ type: "maximize", id });
      },
      restore: () => {
        apply({ type: "restore" });
      },
      collapse: (id: PanelId) => {
        apply({ type: "collapse", id });
      },
      expand: (id: PanelId) => {
        apply({ type: "expand", id });
      },
      resize: (path: readonly number[], sizes: readonly number[]) => {
        apply({ type: "resize", path, sizes });
      },
      insertPanel: (id: PanelId) => {
        apply({ type: "insertPanel", id });
      },
      removePanel: (id: PanelId) => {
        apply({ type: "removePanel", id });
      },
      close: (id: PanelId) => {
        apply({ type: "close", id });
      },
      reopen: (id: PanelId) => {
        apply({ type: "reopen", id });
      },
      openInstance: (kind: "eq-chart", symbol: string) => {
        apply({ type: "openInstance", kind, symbol });
      },
      closeInstance: (id: PanelId) => {
        apply({ type: "closeInstance", id });
      },
      reset: () => {
        apply({ type: "reset" });
      },
      replaceLayout: (state: LayoutState) => {
        apply({ type: "replaceLayout", state });
      },
    },
    dispose,
  };
}
