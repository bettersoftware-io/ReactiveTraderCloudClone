import type { EqDrawing, EqDrawingsState, EqDrawTool } from "@rtc/core-api";

export type EqDrawingsEvent =
  | { readonly kind: "setTool"; readonly tool: EqDrawTool }
  | {
      readonly kind: "addDrawing";
      readonly sym: string;
      readonly drawing: EqDrawing;
    }
  | {
      readonly kind: "updateDrawing";
      readonly sym: string;
      readonly drawing: EqDrawing;
    }
  | { readonly kind: "selectDrawing"; readonly id: string | null }
  | { readonly kind: "deleteSelected"; readonly sym: string }
  | {
      readonly kind: "shiftAnchors";
      readonly sym: string;
      readonly by: number;
    };

export const INITIAL_EQ_DRAWINGS_STATE: EqDrawingsState = {
  tool: "cursor",
  drawings: {},
  selectedId: null,
};

/** The chart-annotation state transition, shared by every application core.
 * A transition that changes nothing returns the SAME reference. */
export function reduceEqDrawings(
  state: EqDrawingsState,
  event: EqDrawingsEvent,
): EqDrawingsState {
  switch (event.kind) {
    case "setTool":
      // Switching tool always drops the selection.
      return { ...state, tool: event.tool, selectedId: null };
    case "addDrawing":
      return addDrawing(state, event.sym, event.drawing);
    case "updateDrawing":
      return updateDrawing(state, event.sym, event.drawing);
    case "selectDrawing":
      return { ...state, selectedId: event.id };
    case "deleteSelected":
      return deleteSelected(state, event.sym);
    case "shiftAnchors":
      return shiftAnchors(state, event.sym, event.by);
  }
}

/** Append + auto-select + revert to cursor (draw one, then you are
 * manipulating — TradingView's default). */
function addDrawing(
  state: EqDrawingsState,
  sym: string,
  drawing: EqDrawing,
): EqDrawingsState {
  const list = state.drawings[sym] ?? [];
  return {
    ...state,
    drawings: { ...state.drawings, [sym]: [...list, drawing] },
    selectedId: drawing.id,
    tool: "cursor",
  };
}

/** Replaces the matching id in place (z-order stable); a no-op when the id
 * is not present. Selection and tool are untouched. */
function updateDrawing(
  state: EqDrawingsState,
  sym: string,
  drawing: EqDrawing,
): EqDrawingsState {
  const list = state.drawings[sym] ?? [];
  const at = list.findIndex((d) => {
    return d.id === drawing.id;
  });

  if (at === -1) {
    return state;
  }

  const next = [...list];
  next[at] = drawing;
  return { ...state, drawings: { ...state.drawings, [sym]: next } };
}

function deleteSelected(state: EqDrawingsState, sym: string): EqDrawingsState {
  if (state.selectedId === null) {
    return state;
  }

  const list = state.drawings[sym] ?? [];
  const filtered = list.filter((d) => {
    return d.id !== state.selectedId;
  });

  if (filtered.length === list.length) {
    return state;
  }

  return {
    ...state,
    drawings: { ...state.drawings, [sym]: filtered },
    selectedId: null,
  };
}

/** Adds `by` to every anchor index of the symbol's trendlines; hlines have
 * no index and other symbols are untouched. */
function shiftAnchors(
  state: EqDrawingsState,
  sym: string,
  by: number,
): EqDrawingsState {
  const list = state.drawings[sym];

  if (list === undefined) {
    return state;
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

  return { ...state, drawings: { ...state.drawings, [sym]: shifted } };
}
