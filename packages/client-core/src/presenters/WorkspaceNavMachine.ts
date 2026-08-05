import { type StateObservable, state } from "@rx-state/core";
import { Subject } from "rxjs";
import { distinctUntilChanged, scan } from "rxjs/operators";

import type { WorkspaceTab } from "#/layout/defaultLayoutPort";

import type { Machine } from "./machine";

export interface WorkspaceNavState {
  readonly activeTab: WorkspaceTab;
}

export interface WorkspaceNavIntents {
  switchTab(tab: WorkspaceTab): void;
}

const INITIAL_STATE: WorkspaceNavState = { activeTab: "fx" };

/**
 * Composition-root SINGLETON tracking the app's active workspace tab — the
 * promoted form of the `useState<WorkspaceTab>` that previously lived
 * directly in `client-react`'s `App.tsx`/`client-solid`'s counterpart,
 * unreachable from composition (and therefore from Jarvis's drive-the-app
 * `switchTab` command; see the P5 `JarvisDriverMachine`, which targets this
 * machine's `switchTab` intent). Mirrors `EqWorkspaceMachine`'s
 * state/Subject/scan/warm-subscribe shape, minus deps — this machine takes
 * none, since `switchTab` is a pure fold over its own prior state.
 *
 * `distinctUntilChanged` collapses a repeated switch to the SAME tab into a
 * no-op emission-wise (still a legal call — a caller doesn't need to check
 * "is this tab already active" first).
 */
export function createWorkspaceNavMachine(): Machine<
  WorkspaceNavState,
  WorkspaceNavIntents
> {
  const switchTab$ = new Subject<WorkspaceTab>();

  const stream$ = switchTab$.pipe(
    scan((s, tab): WorkspaceNavState => {
      return { ...s, activeTab: tab };
    }, INITIAL_STATE),
    distinctUntilChanged((a, b) => {
      return a.activeTab === b.activeTab;
    }),
  );

  const state$: StateObservable<WorkspaceNavState> = state(
    stream$,
    INITIAL_STATE,
  );

  // Keep state$ warm from construction, same rationale as
  // EqWorkspaceMachine/IncidentMachine: a cold state()/shareReplay stream
  // with no live subscriber can drop its buffer between one consumer
  // unmounting and the next mounting.
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
