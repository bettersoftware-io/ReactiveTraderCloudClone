import { type StateObservable, state } from "@rx-state/core";
import { merge, type Observable, Subject } from "rxjs";
import { distinctUntilChanged, map, scan } from "rxjs/operators";

import type {
  Machine,
  WorkspaceNavIntents,
  WorkspaceNavState,
  WorkspaceTab,
} from "@rtc/core-api";
import {
  INITIAL_WORKSPACE_NAV,
  stepWorkspaceNav,
  type WorkspaceNavEvent,
} from "@rtc/core-logic";
import type { AccessLevel } from "@rtc/domain";

/**
 * Composition-root SINGLETON tracking the app's active workspace tab — the
 * promoted form of the `useState<WorkspaceTab>` that previously lived
 * directly in `client-react`'s `App.tsx`/`client-solid`'s counterpart,
 * unreachable from composition (and therefore from Jarvis's drive-the-app
 * `switchTab` command; see the P5 `JarvisDriverMachine`, which targets this
 * machine's `switchTab` intent). Mirrors `EqWorkspaceMachine`'s
 * state/Subject/scan/warm-subscribe shape. Its one dependency is the
 * signed-in user's access stream: the fold (`stepWorkspaceNav`, core-logic)
 * decides which tabs are visible, refuses a switch to a hidden one, and
 * lands on `fx` when the active tab stops being visible.
 *
 * `distinctUntilChanged` (by reference — the fold returns the SAME state for
 * a refused or repeated switch) collapses those into a no-op emission-wise
 * (still a legal call — a caller doesn't need to check "is this tab already
 * active" first).
 */
export function createWorkspaceNavMachine(
  access$: Observable<AccessLevel | null>,
): Machine<WorkspaceNavState, WorkspaceNavIntents> {
  const switchTab$ = new Subject<WorkspaceTab>();

  const stream$ = merge(
    switchTab$.pipe(
      map((tab): WorkspaceNavEvent => {
        return { type: "switchTab", tab };
      }),
    ),
    access$.pipe(
      map((access): WorkspaceNavEvent => {
        return { type: "access", access };
      }),
    ),
  ).pipe(scan(stepWorkspaceNav, INITIAL_WORKSPACE_NAV), distinctUntilChanged());

  const state$: StateObservable<WorkspaceNavState> = state(
    stream$,
    INITIAL_WORKSPACE_NAV,
  );

  // Keep state$ warm from construction, same rationale as
  // EqWorkspaceMachine/IncidentMachine: a cold state()/shareReplay stream
  // with no live subscriber can drop its buffer between one consumer
  // unmounting and the next mounting. This subscription is also the one that
  // listens to `access$`, so the access fold runs for the session.
  const warm = state$.subscribe();

  return {
    state$,
    intents: {
      switchTab: (tab: WorkspaceTab): void => {
        switchTab$.next(tab);
      },
    },
    dispose: () => {
      switchTab$.complete();
      warm.unsubscribe();
    },
  };
}
