import { type StateObservable, state } from "@rx-state/core";
import { merge, Subject } from "rxjs";
import { map, scan } from "rxjs/operators";

import type {
  IncidentIntents,
  IncidentKind,
  IncidentState,
} from "@rtc/core-api";
import type { ConnectionEvent, MetricControl } from "@rtc/domain";

import type { Machine } from "./machine";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { IncidentIntents, IncidentKind, IncidentState };

export interface IncidentDeps {
  /** Control handles for the perturbable simulators (latency, errorRate, topology). */
  readonly controls: readonly MetricControl[];
  /** Sink into the existing connectionEvents merge (composition wires this). */
  readonly pushConnectionEvent: (ev: ConnectionEvent) => void;
}

const INITIAL: IncidentState = { active: [] };

// latencySpike & serviceDown break the gateway; errorBurst is degraded-but-connected.
const DISCONNECTING: ReadonlySet<IncidentKind> = new Set([
  "latencySpike",
  "serviceDown",
]);

/** One incident intent, as the pure fold sees it. */
export type IncidentEvent =
  | { readonly kind: "inject"; readonly incident: IncidentKind }
  | { readonly kind: "clear" };

/** The state transition for one incident intent. */
export function reduceIncident(
  state: IncidentState,
  event: IncidentEvent,
): IncidentState {
  if (event.kind === "clear") {
    return INITIAL;
  }

  return state.active.includes(event.incident)
    ? state
    : { active: [...state.active, event.incident] };
}

/** The connection event an incident intent pushes, if any — latencySpike and
 * serviceDown break the gateway; errorBurst is degraded-but-connected; a
 * clear always reconnects. */
export function incidentConnectionEvent(
  event: IncidentEvent,
): ConnectionEvent | null {
  if (event.kind === "clear") {
    return { type: "gatewayConnected" };
  }

  return DISCONNECTING.has(event.incident)
    ? { type: "gatewayDisconnected" }
    : null;
}

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
