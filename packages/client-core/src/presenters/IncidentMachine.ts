import { type StateObservable, state } from "@rx-state/core";
import { merge, Subject } from "rxjs";
import { map, scan } from "rxjs/operators";

import type {
  IncidentIntents,
  IncidentKind,
  IncidentState,
} from "@rtc/core-api";
import type { Machine } from "@rtc/core-logic";
import {
  type IncidentEvent,
  incidentConnectionEvent,
  reduceIncident,
} from "@rtc/core-logic";
import type { ConnectionEvent, MetricControl } from "@rtc/domain";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
// The pure fold lives in @rtc/core-logic (slice 8); re-exported for this
// module's existing importers.
export type { IncidentEvent, IncidentIntents, IncidentKind, IncidentState };
export { incidentConnectionEvent, reduceIncident };

export interface IncidentDeps {
  /** Control handles for the perturbable simulators (latency, errorRate, topology). */
  readonly controls: readonly MetricControl[];
  /** Sink into the existing connectionEvents merge (composition wires this). */
  readonly pushConnectionEvent: (ev: ConnectionEvent) => void;
}

const INITIAL: IncidentState = { active: [] };

export function createIncidentMachine(
  deps: IncidentDeps,
): Machine<IncidentState, IncidentIntents> {
  const inject$ = new Subject<IncidentKind>();
  const clear$ = new Subject<void>();

  const injectEvent$ = inject$.pipe(
    map((kind): IncidentEvent => {
      // Perturb every control; each simulator reacts only to its own kind (errorBurst moves error-rate/log, not latency/topology).
      for (const c of deps.controls) {
        c.perturb(kind);
      }

      const event: IncidentEvent = { kind: "inject", incident: kind };
      const connectionEvent = incidentConnectionEvent(event);

      if (connectionEvent !== null) {
        deps.pushConnectionEvent(connectionEvent);
      }

      return event;
    }),
  );

  const clearEvent$ = clear$.pipe(
    map((): IncidentEvent => {
      for (const c of deps.controls) {
        c.clearPerturbation();
      }

      const event: IncidentEvent = { kind: "clear" };
      const connectionEvent = incidentConnectionEvent(event);

      if (connectionEvent !== null) {
        deps.pushConnectionEvent(connectionEvent);
      }

      return event;
    }),
  );

  const stream$ = merge(injectEvent$, clearEvent$).pipe(
    scan(reduceIncident, INITIAL),
  );
  const state$: StateObservable<IncidentState> = state(stream$, INITIAL);

  // Keep state$ warm so it carries its default before useMachine first renders.
  const warm = state$.subscribe();

  return {
    state$,
    intents: {
      inject: (kind: IncidentKind): void => {
        inject$.next(kind);
      },
      clear: (): void => {
        clear$.next();
      },
    },
    dispose: () => {
      // Complete the source Subjects first so the merged stream — and the
      // react-rxjs state$ derived from it — completes, then release the warm
      // subscription that was keeping state$ alive.
      inject$.complete();
      clear$.complete();
      warm.unsubscribe();
    },
  };
}
