import { type StateObservable, state } from "@rx-state/core";
import { merge, type Observable, Subject } from "rxjs";
import { filter, map, scan } from "rxjs/operators";

import type { PanelSpecV1 } from "@rtc/shared";

import type { JarvisEvent } from "#/adapters/jarvisPort";

/** Live desk panels are capped at four; a spawn beyond the cap evicts the
 * oldest (index 0) — FIFO. An edit to an already-live panelId never counts
 * toward this cap (see `applyPanelEvent`'s doc). A DOCKED panel (`docked:
 * true`) is invisible to this cap in both directions: it is never counted
 * toward it and never evicted by it — the cap only ever counts and evicts
 * among the `!docked` ("floating") subset. */
export const MAX_LIVE_PANELS = 4;

/** Docked desk panels (pinned into the workspace, out of the floating
 * overlay) are capped separately, at four — see `dockPanel` / `restoreDockedPanel`. */
export const MAX_DOCKED_PANELS = 4;

/**
 * Frozen well-known `PanelSpecV1` the client-side render adapter (Task 4)
 * substitutes for a `"panel"` event's `spec` when the wire payload fails a
 * client-side `parsePanelSpec` re-check. The wire type itself stays
 * `spec: PanelSpecV1` — there is no `null` on the wire — so this machine
 * detects the substitution BY REFERENCE (`===`) against this exact exported
 * const, never by structural comparison, and maps it to
 * `status: "unsupported"` / `spec: null` on the resulting `PanelInstance`.
 * A structurally-identical but independently-constructed object does NOT
 * count as the sentinel.
 */
export const UNSUPPORTED_SENTINEL_SPEC: PanelSpecV1 = Object.freeze({
  v: 1,
  title: "Unsupported panel",
  source: Object.freeze({ kind: "blotter" }),
  transforms: Object.freeze([]),
  viz: Object.freeze({ kind: "table" }),
}) as PanelSpecV1;

export type PanelStatus = "live" | "unsupported";

export interface PanelInstance {
  readonly panelId: string;
  /** null when `status` is "unsupported" — see `UNSUPPORTED_SENTINEL_SPEC`'s doc. */
  readonly spec: PanelSpecV1 | null;
  readonly status: PanelStatus;
  /** True once the panel has been docked into the workspace via `dockPanel`
   * (or restored docked at boot via `restoreDockedPanel`) — false for every
   * fresh wire spawn. A docked panel is invisible to `MAX_LIVE_PANELS`'s
   * floating cap; see that const's doc. */
  readonly docked: boolean;
}

export interface JarvisPanelsState {
  readonly panels: readonly PanelInstance[];
}

const INITIAL: JarvisPanelsState = { panels: [] };

type Patch = (s: JarvisPanelsState) => JarvisPanelsState;

// A named tag (rather than an inline `{ type: "panel" }` literal) so
// `Extract<JarvisEvent, ...>` never takes an inline object type argument —
// mirrors JarvisMachine.ts's identical ConfirmRequestTag idiom (the repo's
// `no-restricted-syntax` bans inline object types even inside a type alias).
interface PanelTag {
  readonly type: "panel";
}
type PanelEvent = Extract<JarvisEvent, PanelTag>;

function isPanelEvent(event: JarvisEvent): event is PanelEvent {
  return event.type === "panel";
}

function toPanelInstance(event: PanelEvent): PanelInstance {
  if (event.spec === UNSUPPORTED_SENTINEL_SPEC) {
    return {
      panelId: event.panelId,
      spec: null,
      status: "unsupported",
      docked: false,
    };
  }

  return {
    panelId: event.panelId,
    spec: event.spec,
    status: "live",
    docked: false,
  };
}

/** Fold one `"panel"` event (spawn or edit-by-`panelId`) into the panels
 * array:
 * - a `panelId` already present is replaced IN PLACE at its existing array
 *   index — a morph, not a move, so its position among sibling panels never
 *   changes on edit. Its `docked` flag is carried over unchanged — a wire
 *   edit to a docked panelId restyles it in place without undocking it.
 * - an unknown `panelId` (including one that was previously dismissed — this
 *   fold has no memory of dismissal, so it looks identical to "never seen")
 *   is APPENDED as a fresh spawn with `docked: false`. If the FLOATING
 *   subset (`!docked`) is already at `MAX_LIVE_PANELS`, the oldest floating
 *   entry is evicted first — FIFO among floating entries only, so docked
 *   entries are invisible to both the count and the eviction — so an edit
 *   never triggers eviction, only a genuine spawn does. */
function applyPanelEvent(
  panels: readonly PanelInstance[],
  event: PanelEvent,
): readonly PanelInstance[] {
  const instance = toPanelInstance(event);
  const existingIndex = panels.findIndex((p) => {
    return p.panelId === event.panelId;
  });

  if (existingIndex !== -1) {
    const next = [...panels];
    next[existingIndex] = {
      ...instance,
      docked: panels[existingIndex].docked,
    };
    return next;
  }

  const floatingCount = panels.reduce((count, p) => {
    return p.docked ? count : count + 1;
  }, 0);

  if (floatingCount < MAX_LIVE_PANELS) {
    return [...panels, instance];
  }

  const oldestFloatingIndex = panels.findIndex((p) => {
    return !p.docked;
  });

  const base = [
    ...panels.slice(0, oldestFloatingIndex),
    ...panels.slice(oldestFloatingIndex + 1),
  ];
  return [...base, instance];
}

/** `dockPanel` reducer: unknown id or already-docked → no-op; at
 * `MAX_DOCKED_PANELS` docked entries → no-op; else sets `docked: true` IN
 * PLACE (array position unchanged — a morph, matching `applyPanelEvent`'s
 * own edit doctrine). */
function dockPanelInState(
  panels: readonly PanelInstance[],
  panelId: string,
): readonly PanelInstance[] {
  const index = panels.findIndex((p) => {
    return p.panelId === panelId;
  });

  if (index === -1 || panels[index].docked) {
    return panels;
  }

  const dockedCount = panels.reduce((count, p) => {
    return p.docked ? count + 1 : count;
  }, 0);

  if (dockedCount >= MAX_DOCKED_PANELS) {
    return panels;
  }

  const next = [...panels];
  next[index] = { ...next[index], docked: true };
  return next;
}

/** `undockPanel` reducer: unknown id or not-docked → no-op; else sets
 * `docked: false`. If the floating count (`!docked`) would then exceed
 * `MAX_LIVE_PANELS`, the oldest OTHER floating entry (by array position,
 * excluding the just-undocked one) is evicted first — the panel being
 * undocked itself is never the eviction target, even when it was the
 * lowest-index entry overall. */
function undockPanelInState(
  panels: readonly PanelInstance[],
  panelId: string,
): readonly PanelInstance[] {
  const index = panels.findIndex((p) => {
    return p.panelId === panelId;
  });

  if (index === -1 || !panels[index].docked) {
    return panels;
  }

  const undocked = [...panels];
  undocked[index] = { ...undocked[index], docked: false };

  const floatingIndices: number[] = [];
  undocked.forEach((p, i) => {
    if (!p.docked) {
      floatingIndices.push(i);
    }
  });

  if (floatingIndices.length <= MAX_LIVE_PANELS) {
    return undocked;
  }

  const victimIndex = floatingIndices.find((i) => {
    return i !== index;
  });

  if (victimIndex === undefined) {
    return undocked;
  }

  return [
    ...undocked.slice(0, victimIndex),
    ...undocked.slice(victimIndex + 1),
  ];
}

/** `restoreDockedPanel` reducer — boot-time rehydration only: appends a
 * `{panelId, spec, status: "live", docked: true}` entry restored from the
 * persisted workspace payload. Dedupes by id (a panelId already present,
 * docked or not, is left untouched). Ignores the floating cap entirely;
 * respects `MAX_DOCKED_PANELS` — excess restores are silently dropped. */
function restoreDockedPanelInState(
  panels: readonly PanelInstance[],
  panelId: string,
  spec: PanelSpecV1,
): readonly PanelInstance[] {
  const alreadyPresent = panels.some((p) => {
    return p.panelId === panelId;
  });

  if (alreadyPresent) {
    return panels;
  }

  const dockedCount = panels.reduce((count, p) => {
    return p.docked ? count + 1 : count;
  }, 0);

  if (dockedCount >= MAX_DOCKED_PANELS) {
    return panels;
  }

  return [...panels, { panelId, spec, status: "live", docked: true }];
}

/** `createJarvisPanelsMachine`'s return — named (rather than inline) to match
 * `JarvisMachine.ts`'s `JarvisMachineHandle` idiom for its own factory
 * return. */
export interface JarvisPanelsMachineHandle {
  readonly state$: StateObservable<JarvisPanelsState>;
  readonly dismissPanel: (panelId: string) => void;
  readonly dockPanel: (panelId: string) => void;
  readonly undockPanel: (panelId: string) => void;
  /** Boot-time rehydration ONLY: append a docked panel restored from the
   * persisted workspace payload. Ignores the floating cap; respects
   * `MAX_DOCKED_PANELS` (excess silently dropped). */
  readonly restoreDockedPanel: (panelId: string, spec: PanelSpecV1) => void;
}

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
        return {
          ...s,
          panels: s.panels.filter((p) => {
            return p.panelId !== panelId;
          }),
        };
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
