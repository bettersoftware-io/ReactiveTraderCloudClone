import { Effect, Exit, Scope, SubscriptionRef } from "effect";

import type {
  Machine,
  WorkspaceNavIntents,
  WorkspaceNavState,
  WorkspaceTab,
} from "@rtc/core-api";

import {
  createChildHost,
  type EffectHost,
  refToWarmStateStream,
  setRefIfChanged,
} from "#/bridge/out";

/** The app's active workspace tab — a warm singleton over a
 * SubscriptionRef in a child of the app host's scope (so `app.dispose()`
 * ends it, as `eqWorkspace`). Switching to the tab already active changes
 * nothing (`setRefIfChanged`), the RxJS core's `distinctUntilChanged`. */
export function createWorkspaceNavMachine(
  parent: EffectHost,
): Machine<WorkspaceNavState, WorkspaceNavIntents> {
  const host = createChildHost(parent);
  const ref = host.runtime.runSync(
    SubscriptionRef.make<WorkspaceNavState>({ activeTab: "fx" }),
  );
  const warm = refToWarmStateStream(host, ref);
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

        host.runtime.runSync(
          setRefIfChanged(ref, (state) => {
            return state.activeTab === tab ? state : { activeTab: tab };
          }),
        );
      },
    },
    dispose: () => {
      markDisposed();
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
  };
}
