import { Effect, Exit, Scope, SubscriptionRef } from "effect";

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

import {
  createChildHost,
  type EffectHost,
  refToWarmStateStream,
  setRefIfChanged,
} from "#/bridge/out";

export interface IncidentDeps {
  /** The perturbable simulators' controls, in `metricControls` order. */
  readonly controls: readonly MetricControl[];
  /** Where an intent's connection event goes (the composition wires the
   * RxJS core's `incident$` seam through `pushIncidentEvent`). */
  readonly pushConnectionEvent: (event: ConnectionEvent) => void;
}

/** The admin incident singleton: the imported fold over a SubscriptionRef,
 * warm for the app's lifetime, in a child of the app host's scope (so
 * `app.dispose()` disposes it, as `eqWorkspace`). Each intent runs
 * synchronously in the RxJS core's order — every control first, then the
 * connection event, then the state. */
export function createIncidentMachine(
  parent: EffectHost,
  deps: IncidentDeps,
): Machine<IncidentState, IncidentIntents> {
  const host = createChildHost(parent);
  const ref = host.runtime.runSync(
    SubscriptionRef.make<IncidentState>({ active: [] }),
  );
  const warm = refToWarmStateStream(host, ref);
  let disposed = false;

  /** Idempotent; reached from `dispose()` and from the scope's own close. */
  function markDisposed(): void {
    if (disposed) {
      return;
    }

    disposed = true;
    warm.release();
  }

  host.runtime.runSync(
    Scope.addFinalizer(host.scope, Effect.sync(markDisposed)),
  );

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

    host.runtime.runSync(
      setRefIfChanged(ref, (state) => {
        return reduceIncident(state, event);
      }),
    );
  }

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
    dispose: () => {
      markDisposed();
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
  };
}
