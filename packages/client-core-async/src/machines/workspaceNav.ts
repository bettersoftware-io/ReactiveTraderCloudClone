import type {
  Machine,
  WorkspaceNavIntents,
  WorkspaceNavState,
  WorkspaceTab,
} from "@rtc/core-api";

import { storeToWarmStateStream } from "#/bridge/out";
import { createStore } from "#/kernel/store";

/** The app's active workspace tab — a warm singleton over a Store, opening
 * on fx. Switching to the tab already active is dropped by the Store's
 * `Object.is` guard, the RxJS core's `distinctUntilChanged`. */
export function createWorkspaceNavMachine(
  lifetime: AbortSignal,
): Machine<WorkspaceNavState, WorkspaceNavIntents> {
  const store = createStore<WorkspaceNavState>({ activeTab: "fx" });
  const warm = storeToWarmStateStream(store);
  let disposed = false;

  function dispose(): void {
    if (disposed) {
      return;
    }

    disposed = true;
    warm.release();
  }

  lifetime.addEventListener("abort", dispose, { once: true });

  return {
    state$: warm.state$,
    intents: {
      switchTab: (tab: WorkspaceTab) => {
        if (disposed) {
          return;
        }

        store.set((state) => {
          return state.activeTab === tab ? state : { activeTab: tab };
        });
      },
    },
    dispose,
  };
}
