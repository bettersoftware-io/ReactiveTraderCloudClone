import { Effect, Exit, Scope, SubscriptionRef } from "effect";

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

import {
  createChildHost,
  type EffectHost,
  refToWarmStateStream,
  setRefIfChanged,
} from "#/bridge/out";

/** The chart-annotation singleton: the imported fold over a
 * `SubscriptionRef`, kept warm for the app's lifetime so a cold
 * `getValue()` between one panel unmounting and the next mounting still
 * reads the live tool and drawing set. A CHILD host, not a detached one:
 * `app.dispose()` ends it, while an intent arriving after that still runs
 * on the default runtime rather than dying on a disposed managed one. */
export function createEqDrawingsMachine(
  parent: EffectHost,
): Machine<EqDrawingsState, EqDrawingsIntents> {
  const host = createChildHost(parent);
  const ref = host.runtime.runSync(
    SubscriptionRef.make<EqDrawingsState>(INITIAL_EQ_DRAWINGS_STATE),
  );
  const warm = refToWarmStateStream(host, ref);
  let disposed = false;

  function apply(event: EqDrawingsEvent): void {
    if (!disposed) {
      host.runtime.runSync(
        setRefIfChanged(ref, (state) => {
          return reduceEqDrawings(state, event);
        }),
      );
    }
  }

  function dispose(): void {
    disposed = true;
    warm.release();
    Effect.runFork(Scope.close(host.scope, Exit.void));
  }

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
