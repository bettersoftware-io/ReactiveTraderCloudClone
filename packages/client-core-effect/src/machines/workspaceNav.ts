import { Effect, Exit, Scope } from "effect";

import type {
  Machine,
  WorkspaceNavIntents,
  WorkspaceNavState,
  WorkspaceTab,
} from "@rtc/core-api";

import { createChildHost, type EffectHost } from "#/bridge/out";
import { createSyncRef } from "#/presenters/syncRef";

/** The app's active workspace tab — a warm singleton over a
 * SubscriptionRef in a child of the app host's scope (so `app.dispose()`
 * ends it, as `eqWorkspace`). Switching to the tab already active changes
 * nothing (an unchanged write is dropped), the RxJS core's
 * `distinctUntilChanged`. A `SyncRef` (slice 7): a subscriber — the shared
 * dock's `activeTab()` read included — sees a switch in the same tick, as in
 * the RxJS core, not a fiber step later. */
export function createWorkspaceNavMachine(
  parent: EffectHost,
): Machine<WorkspaceNavState, WorkspaceNavIntents> {
  const host = createChildHost(parent);
  const ref = createSyncRef<WorkspaceNavState>(host, { activeTab: "fx" });
  const warm = ref.warm();
  let disposed = false;

  /** Idempotent; reached from `dispose()` and from the scope's own close. */
  function markDisposed(): void {
    if (disposed) {
      return;
    }

    disposed = true;
    warm.release();
  }

  host.runtime.runSync(
    Scope.addFinalizer(host.scope, Effect.sync(markDisposed)),
  );

  return {
    state$: warm.state$,
    intents: {
      switchTab: (tab: WorkspaceTab) => {
        if (disposed) {
          return;
        }

        ref.set((state) => {
          return state.activeTab === tab ? state : { activeTab: tab };
        });
      },
    },
    dispose: () => {
      markDisposed();
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
  };
}
