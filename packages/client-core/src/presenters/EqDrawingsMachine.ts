import { type StateObservable, state } from "@rx-state/core";
import { Subject } from "rxjs";
import { scan } from "rxjs/operators";

import type {
  EqDrawing,
  EqDrawingAnchor,
  EqDrawingsIntents,
  EqDrawingsState,
  EqDrawTool,
} from "@rtc/core-api";
import type { Machine } from "@rtc/core-logic";
import {
  type EqDrawingsEvent,
  INITIAL_EQ_DRAWINGS_STATE,
  reduceEqDrawings,
} from "@rtc/core-logic";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type {
  EqDrawing,
  EqDrawingAnchor,
  EqDrawingsIntents,
  EqDrawingsState,
  EqDrawTool,
};

/**
 * Per-symbol chart annotations (trendlines + horizontal levels): the active
 * draw tool, each symbol's drawing list, and the current selection. This is a
 * composition-root SINGLETON — like `EqWorkspaceMachine`, the chart head's
 * tool pills and the plot itself are independent engine cells that cannot
 * share React state, so this machine is the one shared source of truth they
 * both read/write through `useEqDrawings()` (mirrors EqWorkspaceMachine's
 * shared-singleton wiring in composition.ts). Draft state (the line being
 * dragged into existence) never enters this machine — it stays view state in
 * the gesture hooks (ADR-005: DOM-edge-driven per-move computation stays at
 * the view edge).
 *
 * `state$` is kept warm from construction (an internal `.subscribe()`, torn
 * down in `dispose()`), so it always carries a synchronous current value —
 * the same PR #118 refCount lesson EqWorkspaceMachine documents: a cold
 * `shareReplay`/`state()` stream with no live subscriber can drop its buffer
 * between one panel unmounting and the next panel mounting, which would
 * otherwise glitch the shared drawing set.
 */
export function createEqDrawingsMachine(): Machine<
  EqDrawingsState,
  EqDrawingsIntents
> {
  const event$ = new Subject<EqDrawingsEvent>();

  const stream$ = event$.pipe(
    scan(reduceEqDrawings, INITIAL_EQ_DRAWINGS_STATE),
  );

  const state$: StateObservable<EqDrawingsState> = state(
    stream$,
    INITIAL_EQ_DRAWINGS_STATE,
  );

  // Keep state$ warm so it carries its default before any panel's
  // useEqDrawings first renders, and survives every individual panel
  // unmounting/remounting (see the class doc comment above).
  const warm = state$.subscribe();

  return {
    state$,
    intents: {
      setTool: (tool: EqDrawTool): void => {
        event$.next({ kind: "setTool", tool });
      },
      addDrawing: (sym: string, drawing: EqDrawing): void => {
        event$.next({ kind: "addDrawing", sym, drawing });
      },
      updateDrawing: (sym: string, drawing: EqDrawing): void => {
        event$.next({ kind: "updateDrawing", sym, drawing });
      },
      selectDrawing: (id: string | null): void => {
        event$.next({ kind: "selectDrawing", id });
      },
      deleteSelected: (sym: string): void => {
        event$.next({ kind: "deleteSelected", sym });
      },
      shiftAnchors: (sym: string, by: number): void => {
        event$.next({ kind: "shiftAnchors", sym, by });
      },
    },
    dispose: () => {
      event$.complete();
      warm.unsubscribe();
    },
  };
}
