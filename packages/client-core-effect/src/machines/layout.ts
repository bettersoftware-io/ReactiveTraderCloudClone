import type {
  LayoutIntents,
  LayoutState,
  Machine,
  PanelId,
} from "@rtc/core-api";
import {
  createLayoutReducer,
  type LayoutEvent,
  layoutStaticIds,
} from "@rtc/core-logic";

import type { EffectHost } from "#/bridge/out";
import { createSyncRef, type SyncRef } from "#/presenters/syncRef";

/** One tab's layout machine: a `SyncRef` folded by the SHARED layout
 * reducer (`@rtc/client-core`'s `createLayoutReducer` — the RxJS core folds
 * the very same function). Every intent has committed by the time it
 * returns (the workspace's synchronous-fold contract); `seed` is the
 * persisted tree a first-opened tab starts from, `reset()` still returns
 * `initial`. `dispose` releases the keep-warm; the workspace's host scope
 * does too. */
export interface LayoutMachine extends Machine<LayoutState, LayoutIntents> {
  readonly ref: SyncRef<LayoutState>;
}

export function createLayoutMachine(
  host: EffectHost,
  initial: LayoutState,
  seed: LayoutState | undefined,
): LayoutMachine {
  const reduce = createLayoutReducer(initial, layoutStaticIds(initial));
  const ref = createSyncRef<LayoutState>(host, seed ?? initial);
  const warm = ref.warm();
  let disposed = false;

  function applyLayoutEvent(event: LayoutEvent): void {
    if (disposed) {
      return;
    }

    ref.set((state) => {
      return reduce(state, event);
    });
  }

  return {
    ref,
    state$: warm.state$,
    intents: {
      maximize: (id: PanelId) => {
        applyLayoutEvent({ type: "maximize", id });
      },
      restore: () => {
        applyLayoutEvent({ type: "restore" });
      },
      collapse: (id: PanelId) => {
        applyLayoutEvent({ type: "collapse", id });
      },
      expand: (id: PanelId) => {
        applyLayoutEvent({ type: "expand", id });
      },
      resize: (path: readonly number[], sizes: readonly number[]) => {
        applyLayoutEvent({ type: "resize", path, sizes });
      },
      insertPanel: (id: PanelId) => {
        applyLayoutEvent({ type: "insertPanel", id });
      },
      removePanel: (id: PanelId) => {
        applyLayoutEvent({ type: "removePanel", id });
      },
      close: (id: PanelId) => {
        applyLayoutEvent({ type: "close", id });
      },
      reopen: (id: PanelId) => {
        applyLayoutEvent({ type: "reopen", id });
      },
      openInstance: (kind: "eq-chart", symbol: string) => {
        applyLayoutEvent({ type: "openInstance", kind, symbol });
      },
      closeInstance: (id: PanelId) => {
        applyLayoutEvent({ type: "closeInstance", id });
      },
      reset: () => {
        applyLayoutEvent({ type: "reset" });
      },
      replaceLayout: (state: LayoutState) => {
        applyLayoutEvent({ type: "replaceLayout", state });
      },
    },
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      warm.release();
    },
  };
}
