import { type StateObservable, state } from "@rx-state/core";
import { merge, Subject } from "rxjs";
import { map, scan } from "rxjs/operators";

import type { Machine } from "./machine";

// Declared locally rather than imported from @rtc/motion-core — client-core
// must not depend on motion-core (see global constraints; the same EqPaneId
// doctrine as EqWorkspaceMachine). motion-core's drawingScene types unify
// with these structurally.
export type EqDrawTool = "cursor" | "trendline" | "hline";

export interface EqDrawingAnchor {
  readonly index: number; // candle index, snapped to a center at commit
  readonly price: number; // unsnapped
}

export type EqDrawing =
  | {
      readonly id: string;
      readonly kind: "trendline";
      readonly a: EqDrawingAnchor;
      readonly b: EqDrawingAnchor;
    }
  | { readonly id: string; readonly kind: "hline"; readonly price: number };

export interface EqDrawingsState {
  readonly tool: EqDrawTool;
  readonly drawings: Readonly<Record<string, readonly EqDrawing[]>>;
  readonly selectedId: string | null;
}

export interface EqDrawingsIntents {
  setTool(tool: EqDrawTool): void;
  addDrawing(sym: string, drawing: EqDrawing): void;
  updateDrawing(sym: string, drawing: EqDrawing): void;
  selectDrawing(id: string | null): void;
  deleteSelected(sym: string): void;
  shiftAnchors(sym: string, by: number): void;
}

type Patch = (s: EqDrawingsState) => EqDrawingsState;

interface AddDrawingPayload {
  readonly sym: string;
  readonly drawing: EqDrawing;
}

interface ShiftAnchorsPayload {
  readonly sym: string;
  readonly by: number;
}

const initial: EqDrawingsState = {
  tool: "cursor",
  drawings: {},
  selectedId: null,
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
  const setTool$ = new Subject<EqDrawTool>();
  const addDrawing$ = new Subject<AddDrawingPayload>();
  const updateDrawing$ = new Subject<AddDrawingPayload>();
  const selectDrawing$ = new Subject<string | null>();
  const deleteSelected$ = new Subject<string>();
  const shiftAnchors$ = new Subject<ShiftAnchorsPayload>();

  // setTool: switching tool always drops the selection.
  const setToolPatch$ = setTool$.pipe(
    map((tool): Patch => {
      return (s: EqDrawingsState): EqDrawingsState => {
        return { ...s, tool, selectedId: null };
      };
    }),
  );

  // addDrawing: append + auto-select + revert to cursor (draw one, then
  // you're manipulating — TradingView's default).
  const addDrawingPatch$ = addDrawing$.pipe(
    map(({ sym, drawing }): Patch => {
      return (s: EqDrawingsState): EqDrawingsState => {
        const list = s.drawings[sym] ?? [];
        return {
          ...s,
          drawings: { ...s.drawings, [sym]: [...list, drawing] },
          selectedId: drawing.id,
          tool: "cursor",
        };
      };
    }),
  );

  // updateDrawing: replaces the matching id in place (z-order stable);
  // no-op when the id isn't present (same defensive shape as
  // deleteSelected). Selection and tool are untouched — after a drag the
  // user is still holding the same selected drawing.
  const updateDrawingPatch$ = updateDrawing$.pipe(
    map(({ sym, drawing }): Patch => {
      return (s: EqDrawingsState): EqDrawingsState => {
        const list = s.drawings[sym] ?? [];
        const at = list.findIndex((d) => {
          return d.id === drawing.id;
        });

        if (at === -1) {
          return s;
        }

        const next = [...list];
        next[at] = drawing;
        return { ...s, drawings: { ...s.drawings, [sym]: next } };
      };
    }),
  );

  const selectDrawingPatch$ = selectDrawing$.pipe(
    map((id): Patch => {
      return (s: EqDrawingsState): EqDrawingsState => {
        return { ...s, selectedId: id };
      };
    }),
  );

  // deleteSelected: removes the selected drawing from the given symbol's
  // list and clears the selection; a no-op when selectedId is null or not
  // among that symbol's drawings.
  const deleteSelectedPatch$ = deleteSelected$.pipe(
    map((sym): Patch => {
      return (s: EqDrawingsState): EqDrawingsState => {
        if (s.selectedId === null) {
          return s;
        }

        const list = s.drawings[sym] ?? [];
        const filtered = list.filter((d) => {
          return d.id !== s.selectedId;
        });

        if (filtered.length === list.length) {
          return s;
        }

        return {
          ...s,
          drawings: { ...s.drawings, [sym]: filtered },
          selectedId: null,
        };
      };
    }),
  );

  // shiftAnchors: adds `by` to every anchor index for the given symbol's
  // trendlines (both anchors); hlines have no index and are untouched, as
  // are other symbols' drawings.
  const shiftAnchorsPatch$ = shiftAnchors$.pipe(
    map(({ sym, by }): Patch => {
      return (s: EqDrawingsState): EqDrawingsState => {
        const list = s.drawings[sym];

        if (list === undefined) {
          return s;
        }

        const shifted = list.map((d) => {
          if (d.kind !== "trendline") {
            return d;
          }

          return {
            ...d,
            a: { ...d.a, index: d.a.index + by },
            b: { ...d.b, index: d.b.index + by },
          };
        });

        return { ...s, drawings: { ...s.drawings, [sym]: shifted } };
      };
    }),
  );

  const stream$ = merge(
    setToolPatch$,
    addDrawingPatch$,
    updateDrawingPatch$,
    selectDrawingPatch$,
    deleteSelectedPatch$,
    shiftAnchorsPatch$,
  ).pipe(
    scan((s, patch) => {
      return patch(s);
    }, initial),
  );

  const state$: StateObservable<EqDrawingsState> = state(stream$, initial);

  // Keep state$ warm so it carries its default before any panel's
  // useEqDrawings first renders, and survives every individual panel
  // unmounting/remounting (see the class doc comment above).
  const warm = state$.subscribe();

  return {
    state$,
    intents: {
      setTool: (tool: EqDrawTool): void => {
        setTool$.next(tool);
      },
      addDrawing: (sym: string, drawing: EqDrawing): void => {
        addDrawing$.next({ sym, drawing });
      },
      updateDrawing: (sym: string, drawing: EqDrawing): void => {
        updateDrawing$.next({ sym, drawing });
      },
      selectDrawing: (id: string | null): void => {
        selectDrawing$.next(id);
      },
      deleteSelected: (sym: string): void => {
        deleteSelected$.next(sym);
      },
      shiftAnchors: (sym: string, by: number): void => {
        shiftAnchors$.next({ sym, by });
      },
    },
    dispose: () => {
      setTool$.complete();
      addDrawing$.complete();
      updateDrawing$.complete();
      selectDrawing$.complete();
      deleteSelected$.complete();
      shiftAnchors$.complete();
      warm.unsubscribe();
    },
  };
}
