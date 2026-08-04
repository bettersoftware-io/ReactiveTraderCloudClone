import { type StateObservable, state } from "@rx-state/core";
import { merge, type Observable, Subject } from "rxjs";
import { filter, map, scan } from "rxjs/operators";

import type { PanelSpecV1 } from "@rtc/shared";

import type { JarvisEvent } from "#/adapters/jarvisPort";

/** Live desk panels are capped at four; a spawn beyond the cap evicts the
 * oldest (index 0) — FIFO. An edit to an already-live panelId never counts
 * toward this cap (see `applyPanelEvent`'s doc). */
export const MAX_LIVE_PANELS = 4;

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
    return { panelId: event.panelId, spec: null, status: "unsupported" };
  }

  return { panelId: event.panelId, spec: event.spec, status: "live" };
}

/** Fold one `"panel"` event (spawn or edit-by-`panelId`) into the panels
 * array:
 * - a `panelId` already present is replaced IN PLACE at its existing array
 *   index — a morph, not a move, so its position among sibling panels never
 *   changes on edit.
 * - an unknown `panelId` (including one that was previously dismissed — this
 *   fold has no memory of dismissal, so it looks identical to "never seen")
 *   is APPENDED as a fresh spawn. If the array is already at
 *   `MAX_LIVE_PANELS`, the oldest (index 0) is evicted first — FIFO — so an
 *   edit never triggers eviction, only a genuine spawn does. */
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
    next[existingIndex] = instance;
    return next;
  }

  const base = panels.length >= MAX_LIVE_PANELS ? panels.slice(1) : panels;
  return [...base, instance];
}

/** `createJarvisPanelsMachine`'s return — named (rather than inline) to match
 * `JarvisMachine.ts`'s `JarvisMachineHandle` idiom for its own factory
 * return. */
export interface JarvisPanelsMachineHandle {
  readonly state$: StateObservable<JarvisPanelsState>;
  readonly dismissPanel: (panelId: string) => void;
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

  const stream$ = merge(panelPatches$, dismissPatches$).pipe(
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
  };
}
