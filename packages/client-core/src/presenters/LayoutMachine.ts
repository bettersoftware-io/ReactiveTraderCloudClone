import { type DefaultedStateObservable, state } from "@rx-state/core";
import { merge, Subject } from "rxjs";
import { map, scan } from "rxjs/operators";

import type { LayoutIntents, LayoutMachineOptions } from "@rtc/core-api";
import type {
  LayoutPort,
  LayoutState,
  Machine,
  PanelId,
} from "@rtc/core-logic";
import {
  createLayoutReducer,
  type LayoutEvent,
  layoutStaticIds,
} from "@rtc/core-logic";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { LayoutIntents, LayoutMachineOptions };

type ResizePayload = { path: readonly number[]; sizes: readonly number[] };
type OpenInstancePayload = { kind: "eq-chart"; symbol: string };

/** Neutral layout view-model. Holds the tree, applies the five intents over an
 * immutable reducer, and emits LayoutState. No DOM. Mirrors the NotionalMachine
 * intent-driven precedent: Subjects → merged events → scan → state() + a warm
 * subscription released in dispose(). */
export function createLayoutMachine(
  port: LayoutPort,
  options?: LayoutMachineOptions,
): Machine<LayoutState, LayoutIntents> {
  const staticIds = layoutStaticIds(port.initial);
  const startState = options?.seedState ?? port.initial;

  const maximize$ = new Subject<PanelId>();
  const restore$ = new Subject<void>();
  const collapse$ = new Subject<PanelId>();
  const expand$ = new Subject<PanelId>();
  const resize$ = new Subject<ResizePayload>();
  const insertPanel$ = new Subject<PanelId>();
  const removePanel$ = new Subject<PanelId>();
  const close$ = new Subject<PanelId>();
  const reopen$ = new Subject<PanelId>();
  const openInstance$ = new Subject<OpenInstancePayload>();
  const closeInstance$ = new Subject<PanelId>();
  const reset$ = new Subject<void>();
  const replaceLayout$ = new Subject<LayoutState>();

  const events$ = merge(
    maximize$.pipe(
      map((id): LayoutEvent => {
        return { type: "maximize", id };
      }),
    ),
    restore$.pipe(
      map((): LayoutEvent => {
        return { type: "restore" };
      }),
    ),
    collapse$.pipe(
      map((id): LayoutEvent => {
        return { type: "collapse", id };
      }),
    ),
    expand$.pipe(
      map((id): LayoutEvent => {
        return { type: "expand", id };
      }),
    ),
    resize$.pipe(
      map(({ path, sizes }): LayoutEvent => {
        return { type: "resize", path, sizes };
      }),
    ),
    insertPanel$.pipe(
      map((id): LayoutEvent => {
        return { type: "insertPanel", id };
      }),
    ),
    removePanel$.pipe(
      map((id): LayoutEvent => {
        return { type: "removePanel", id };
      }),
    ),
    close$.pipe(
      map((id): LayoutEvent => {
        return { type: "close", id };
      }),
    ),
    reopen$.pipe(
      map((id): LayoutEvent => {
        return { type: "reopen", id };
      }),
    ),
    openInstance$.pipe(
      map(({ kind, symbol }): LayoutEvent => {
        return { type: "openInstance", kind, symbol };
      }),
    ),
    closeInstance$.pipe(
      map((id): LayoutEvent => {
        return { type: "closeInstance", id };
      }),
    ),
    reset$.pipe(
      map((): LayoutEvent => {
        return { type: "reset" };
      }),
    ),
    replaceLayout$.pipe(
      map((state): LayoutEvent => {
        return { type: "replaceLayout", state };
      }),
    ),
  );

  const stream$ = events$.pipe(
    scan(createLayoutReducer(port.initial, staticIds), startState),
  );

  const state$: DefaultedStateObservable<LayoutState> = state(
    stream$,
    startState,
  );

  // Keep state$ warm so it carries its default before useMachine first renders.
  const warm = state$.subscribe();

  return {
    state$,
    intents: {
      maximize: (id: PanelId) => {
        maximize$.next(id);
      },
      restore: () => {
        restore$.next();
      },
      collapse: (id: PanelId) => {
        collapse$.next(id);
      },
      expand: (id: PanelId) => {
        expand$.next(id);
      },
      resize: (path: readonly number[], sizes: readonly number[]) => {
        resize$.next({ path, sizes });
      },
      insertPanel: (panelId: PanelId) => {
        insertPanel$.next(panelId);
      },
      removePanel: (panelId: PanelId) => {
        removePanel$.next(panelId);
      },
      close: (id: PanelId) => {
        close$.next(id);
      },
      reopen: (id: PanelId) => {
        reopen$.next(id);
      },
      openInstance: (kind: "eq-chart", symbol: string) => {
        openInstance$.next({ kind, symbol });
      },
      closeInstance: (id: PanelId) => {
        closeInstance$.next(id);
      },
      reset: () => {
        reset$.next();
      },
      replaceLayout: (state: LayoutState) => {
        replaceLayout$.next(state);
      },
    },
    dispose: () => {
      maximize$.complete();
      restore$.complete();
      collapse$.complete();
      expand$.complete();
      resize$.complete();
      insertPanel$.complete();
      removePanel$.complete();
      close$.complete();
      reopen$.complete();
      openInstance$.complete();
      closeInstance$.complete();
      reset$.complete();
      replaceLayout$.complete();
      warm.unsubscribe();
    },
  };
}
