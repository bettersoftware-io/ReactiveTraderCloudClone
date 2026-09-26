import { type StateObservable, state } from "@rx-state/core";
import { merge, type Observable, Subject } from "rxjs";
import { filter, map, scan } from "rxjs/operators";

import type {
  JarvisPanelsMachineHandle,
  JarvisPanelsState,
  PanelInstance,
  PanelStatus,
} from "@rtc/core-api";
import {
  applyPanelEvent,
  dismissPanelInState,
  dockPanelInState,
  isPanelEvent,
  restoreDockedPanelInState,
  undockPanelInState,
} from "@rtc/core-logic";
import type { PanelSpecV1 } from "@rtc/shared";

import type { JarvisEvent } from "#/adapters/jarvisPort";

export {
  MAX_DOCKED_PANELS,
  MAX_LIVE_PANELS,
  UNSUPPORTED_SENTINEL_SPEC,
} from "@rtc/core-logic";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type {
  JarvisPanelsMachineHandle,
  JarvisPanelsState,
  PanelInstance,
  PanelStatus,
};

const INITIAL: JarvisPanelsState = { panels: [] };

type Patch = (s: JarvisPanelsState) => JarvisPanelsState;

/** `restoreDockedPanel`'s intent payload — named (rather than an inline
 * object type argument to `Subject<...>`) per the repo's
 * `no-restricted-syntax` ban on inline object types. */
interface RestoreDockedPanelRequest {
  readonly panelId: string;
  readonly spec: PanelSpecV1;
}

/**
 * Session-lifetime fold over the Jarvis event stream's `"panel"` events plus
 * a local `dismissPanel` intent, producing the live desk-panel roster.
 * Created once at composition (Task 6 wires it in), NOT per overlay mount —
 * unlike the per-instance machines in `MachineFactories`. `JarvisMachine`'s
 * own `"panel"` arm is a deliberate no-op; this machine is the sole owner of
 * panel lifecycle.
 */
export function createJarvisPanelsMachine(
  events$: Observable<JarvisEvent>,
): JarvisPanelsMachineHandle {
  const dismiss$ = new Subject<string>();
  const dock$ = new Subject<string>();
  const undock$ = new Subject<string>();
  const restore$ = new Subject<RestoreDockedPanelRequest>();

  const panelPatches$: Observable<Patch> = events$.pipe(
    filter(isPanelEvent),
    map((event): Patch => {
      return (s: JarvisPanelsState): JarvisPanelsState => {
        return { ...s, panels: applyPanelEvent(s.panels, event) };
      };
    }),
  );

  const dismissPatches$: Observable<Patch> = dismiss$.pipe(
    map((panelId): Patch => {
      return (s: JarvisPanelsState): JarvisPanelsState => {
        return { ...s, panels: dismissPanelInState(s.panels, panelId) };
      };
    }),
  );

  const dockPatches$: Observable<Patch> = dock$.pipe(
    map((panelId): Patch => {
      return (s: JarvisPanelsState): JarvisPanelsState => {
        return { ...s, panels: dockPanelInState(s.panels, panelId) };
      };
    }),
  );

  const undockPatches$: Observable<Patch> = undock$.pipe(
    map((panelId): Patch => {
      return (s: JarvisPanelsState): JarvisPanelsState => {
        return { ...s, panels: undockPanelInState(s.panels, panelId) };
      };
    }),
  );

  const restorePatches$: Observable<Patch> = restore$.pipe(
    map(({ panelId, spec }): Patch => {
      return (s: JarvisPanelsState): JarvisPanelsState => {
        return {
          ...s,
          panels: restoreDockedPanelInState(s.panels, panelId, spec),
        };
      };
    }),
  );

  const stream$ = merge(
    panelPatches$,
    dismissPatches$,
    dockPatches$,
    undockPatches$,
    restorePatches$,
  ).pipe(
    scan((s, patch) => {
      return patch(s);
    }, INITIAL),
  );

  const state$: StateObservable<JarvisPanelsState> = state(stream$, INITIAL);

  // Keep state$ warm so it carries its default (and replays the current
  // fold) before a late subscriber's first render — same idiom as
  // JarvisMachine's `warm` subscription.
  state$.subscribe();

  return {
    state$,
    dismissPanel: (panelId: string) => {
      dismiss$.next(panelId);
    },
    dockPanel: (panelId: string) => {
      dock$.next(panelId);
    },
    undockPanel: (panelId: string) => {
      undock$.next(panelId);
    },
    restoreDockedPanel: (panelId: string, spec: PanelSpecV1) => {
      restore$.next({ panelId, spec });
    },
  };
}
