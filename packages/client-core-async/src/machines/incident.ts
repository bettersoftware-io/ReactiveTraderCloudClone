import type {
  IncidentIntents,
  IncidentKind,
  IncidentState,
  Machine,
} from "@rtc/core-api";
import {
  type IncidentEvent,
  incidentConnectionEvent,
  reduceIncident,
} from "@rtc/core-logic";
import type { ConnectionEvent, MetricControl } from "@rtc/domain";

import { storeToWarmStateStream } from "#/bridge/out";
import { createStore } from "#/kernel/store";

export interface IncidentDeps {
  /** The perturbable simulators' controls, in `metricControls` order. */
  readonly controls: readonly MetricControl[];
  /** Where an intent's connection event goes (the composition wires
   * `ports.connectionIntents.injectIncident`). */
  readonly pushConnectionEvent: (event: ConnectionEvent) => void;
}

/** The admin incident singleton: the imported fold over a Store, warm for
 * the app's lifetime. Each intent runs synchronously in the RxJS core's
 * order — every control first, then the connection event, then the state. */
export function createIncidentMachine(
  deps: IncidentDeps,
  lifetime: AbortSignal,
): Machine<IncidentState, IncidentIntents> {
  const store = createStore<IncidentState>({ active: [] });
  const warm = storeToWarmStateStream(store);
  let disposed = false;

  function apply(event: IncidentEvent): void {
    if (disposed) {
      return;
    }

    for (const control of deps.controls) {
      if (event.kind === "inject") {
        control.perturb(event.incident);
      } else {
        control.clearPerturbation();
      }
    }

    const connectionEvent = incidentConnectionEvent(event);

    if (connectionEvent !== null) {
      deps.pushConnectionEvent(connectionEvent);
    }

    store.set((state) => {
      return reduceIncident(state, event);
    });
  }

  function dispose(): void {
    if (disposed) {
      return;
    }

    disposed = true;
    warm.release();
  }

  lifetime.addEventListener("abort", dispose, { once: true });

  return {
    state$: warm.state$,
    intents: {
      inject: (kind: IncidentKind) => {
        apply({ kind: "inject", incident: kind });
      },
      clear: () => {
        apply({ kind: "clear" });
      },
    },
    dispose,
  };
}
