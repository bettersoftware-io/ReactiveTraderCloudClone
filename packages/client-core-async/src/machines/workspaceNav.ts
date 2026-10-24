import type {
  AuthViewState,
  Machine,
  Stream,
  WorkspaceNavIntents,
  WorkspaceNavState,
  WorkspaceTab,
} from "@rtc/core-api";
import { INITIAL_WORKSPACE_NAV, stepWorkspaceNav } from "@rtc/core-logic";

import { relay } from "#/bridge/in";
import { storeToWarmStateStream } from "#/bridge/out";
import { reportAsync } from "#/kernel/reportAsync";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

/** The app's active workspace tab and the tabs the signed-in user may open —
 * a warm singleton over a Store, opening on fx. The core-logic fold
 * (`stepWorkspaceNav`) decides which tabs are visible, refuses a switch to a
 * hidden one and lands on `fx` when the active tab stops being visible. The
 * auth state is relayed in at construction: a replay-current source answers
 * during `subscribe`, so a resumed session's access is in the store before
 * the first subscriber reads it. A step that changes nothing returns the
 * SAME state, which the Store's `Object.is` guard drops (the RxJS core's
 * `distinctUntilChanged`). */
export function createWorkspaceNavMachine(
  authState$: Stream<AuthViewState>,
  lifetime: AbortSignal,
): Machine<WorkspaceNavState, WorkspaceNavIntents> {
  const store = createStore<WorkspaceNavState>(INITIAL_WORKSPACE_NAV);
  const warm = storeToWarmStateStream(store);
  const own = new AbortController();
  let disposed = false;

  function dispose(): void {
    if (disposed) {
      return;
    }

    disposed = true;
    own.abort();
    warm.release();
  }

  lifetime.addEventListener("abort", dispose, { once: true });

  void spawn(() => {
    return relay(authState$, own.signal, (auth) => {
      store.set((state) => {
        return stepWorkspaceNav(state, {
          type: "access",
          access: auth.user?.access ?? null,
        });
      });
    });
  }, reportAsync);

  return {
    state$: warm.state$,
    intents: {
      switchTab: (tab: WorkspaceTab) => {
        if (disposed) {
          return;
        }

        store.set((state) => {
          return stepWorkspaceNav(state, { type: "switchTab", tab });
        });
      },
    },
    dispose,
  };
}
