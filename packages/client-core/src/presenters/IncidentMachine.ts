import { type StateObservable, state } from "@rx-state/core";
import { merge, Subject } from "rxjs";
import { map, scan } from "rxjs/operators";

import type {
  IncidentDeps,
  IncidentIntents,
  IncidentKind,
  IncidentState,
} from "@rtc/core-api";

import type { Machine } from "./machine";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { IncidentDeps, IncidentIntents, IncidentKind, IncidentState };

const INITIAL: IncidentState = { active: [] };

// latencySpike & serviceDown break the gateway; errorBurst is degraded-but-connected.
const DISCONNECTING: ReadonlySet<IncidentKind> = new Set([
  "latencySpike",
  "serviceDown",
]);

type Patch = (s: IncidentState) => IncidentState;

export function createIncidentMachine(
  deps: IncidentDeps,
): Machine<IncidentState, IncidentIntents> {
  const inject$ = new Subject<IncidentKind>();
  const clear$ = new Subject<void>();

  const injectPatch$ = inject$.pipe(
    map((kind): Patch => {
      // Perturb every control; each simulator reacts only to its own kind (errorBurst moves error-rate/log, not latency/topology).
      for (const c of deps.controls) {
        c.perturb(kind);
      }

      if (DISCONNECTING.has(kind)) {
        deps.pushConnectionEvent({ type: "gatewayDisconnected" });
      }

      return (s: IncidentState): IncidentState => {
        return {
          active: s.active.includes(kind) ? s.active : [...s.active, kind],
        };
      };
    }),
  );

  const clearPatch$ = clear$.pipe(
    map((): Patch => {
      for (const c of deps.controls) {
        c.clearPerturbation();
      }

      deps.pushConnectionEvent({ type: "gatewayConnected" });

      return () => {
        return INITIAL;
      };
    }),
  );

  const stream$ = merge(injectPatch$, clearPatch$).pipe(
    scan((s, patch) => {
      return patch(s);
    }, INITIAL),
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
