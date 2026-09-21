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

  /** Idempotent, and reached from BOTH ends of the machine's lifetime —
   * `dispose()` and the child scope's own close. */
  function markDisposed(): void {
    disposed = true;
    warm.release();
  }

  // `app.dispose()` closes the app host's scope, and this machine's is a
  // CHILD of it, so that close has to dispose the machine too. Without this
  // finalizer the singleton freezes instead: the keep-warm fiber is
  // interrupted while `disposed` is still false, so every later intent
  // writes a ref nobody will ever hear and the RxJS keep-warm subscription
  // is never released. The async twin converges the same two ends through
  // its `lifetime` abort listener.
  host.runtime.runSync(
    Scope.addFinalizer(host.scope, Effect.sync(markDisposed)),
  );

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
    // Synchronously, not only through the finalizer: `dispose()` promises
    // that the very next intent is ignored, and closing the scope is a
    // forked effect.
    markDisposed();
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
