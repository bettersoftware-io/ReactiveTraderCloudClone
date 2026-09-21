import {
  type EqDrawingsEvent,
  INITIAL_EQ_DRAWINGS_STATE,
  reduceEqDrawings,
} from "@rtc/client-core";
import type {
  EqDrawing,
  EqDrawingsIntents,
  EqDrawingsState,
  EqDrawTool,
  Machine,
} from "@rtc/core-api";

import { storeToWarmStateStream } from "#/bridge/out";
import { createStore } from "#/kernel/store";

/** The chart-annotation singleton: the imported fold over a Store, warm for
 * the app's lifetime. */
export function createEqDrawingsMachine(
  lifetime: AbortSignal,
): Machine<EqDrawingsState, EqDrawingsIntents> {
  const store = createStore<EqDrawingsState>(INITIAL_EQ_DRAWINGS_STATE);
  const warm = storeToWarmStateStream(store);
  let disposed = false;

  function apply(event: EqDrawingsEvent): void {
    if (!disposed) {
      store.set((state) => {
        return reduceEqDrawings(state, event);
      });
    }
  }

  function dispose(): void {
    disposed = true;
    warm.release();
  }

  lifetime.addEventListener("abort", dispose, { once: true });

  return {
    state$: warm.state$,
    intents: {
      setTool: (tool: EqDrawTool) => {
        apply({ kind: "setTool", tool });
      },
      addDrawing: (sym: string, drawing: EqDrawing) => {
        apply({ kind: "addDrawing", sym, drawing });
      },
      updateDrawing: (sym: string, drawing: EqDrawing) => {
        apply({ kind: "updateDrawing", sym, drawing });
      },
      selectDrawing: (id: string | null) => {
        apply({ kind: "selectDrawing", id });
      },
      deleteSelected: (sym: string) => {
        apply({ kind: "deleteSelected", sym });
      },
      shiftAnchors: (sym: string, by: number) => {
        apply({ kind: "shiftAnchors", sym, by });
      },
    },
    dispose,
  };
}
