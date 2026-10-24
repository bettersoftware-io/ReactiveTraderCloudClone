import { Cause, Effect, Scope } from "effect";

import type {
  AuthViewState,
  Machine,
  Stream,
  WorkspaceNavIntents,
  WorkspaceNavState,
  WorkspaceTab,
} from "@rtc/core-api";
import { INITIAL_WORKSPACE_NAV, stepWorkspaceNav } from "@rtc/core-logic";

import {
  closeScope,
  createChildHost,
  type EffectHost,
  listenToStream,
  reportOutOfBand,
} from "#/bridge/out";
import { createSyncRef } from "#/bridge/syncRef";

/** The app's active workspace tab and the tabs the signed-in user may open —
 * a warm singleton over a `SyncRef` in a child of the app host's scope (so
 * `app.dispose()` ends it, as `eqWorkspace`). The core-logic fold
 * (`stepWorkspaceNav`) decides which tabs are visible, refuses a switch to a
 * hidden one and lands on `fx` when the active tab stops being visible. The
 * auth state is heard SYNCHRONOUSLY from construction (`listenToStream`; the
 * auth ref replays on subscribe), so a resumed administrator's access is in
 * the ref before the first subscriber reads it. A step that changes nothing
 * returns the SAME state, which the ref drops (the RxJS core's
 * `distinctUntilChanged`). A subscriber — the shared dock's `activeTab()`
 * read included — sees a switch in the same tick, as in the RxJS core. */
export function createWorkspaceNavMachine(
  parent: EffectHost,
  authState$: Stream<AuthViewState>,
): Machine<WorkspaceNavState, WorkspaceNavIntents> {
  const host = createChildHost(parent);
  const ref = createSyncRef<WorkspaceNavState>(INITIAL_WORKSPACE_NAV);
  const warm = ref.warm();
  let disposed = false;
  const stopListening = listenToStream(
    authState$,
    (auth: AuthViewState) => {
      ref.set((state) => {
        return stepWorkspaceNav(state, {
          type: "access",
          access: auth.user?.access ?? null,
        });
      });
    },
    (error: unknown) => {
      reportOutOfBand(Cause.die(error));
    },
  );

  /** Idempotent; reached from `dispose()` and from the scope's own close. */
  function markDisposed(): void {
    if (disposed) {
      return;
    }

    disposed = true;
    stopListening();
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
          return stepWorkspaceNav(state, { type: "switchTab", tab });
        });
      },
    },
    dispose: () => {
      markDisposed();
      closeScope(host.scope);
    },
  };
}
