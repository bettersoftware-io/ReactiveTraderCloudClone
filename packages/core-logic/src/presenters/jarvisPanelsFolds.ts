import type { PanelInstance } from "@rtc/core-api";
import {
  MAX_DOCKED_PANELS as DOMAIN_MAX_DOCKED_PANELS,
  MAX_LIVE_PANELS as DOMAIN_MAX_LIVE_PANELS,
} from "@rtc/domain";
import type { JarvisEvent, PanelSpecV1 } from "@rtc/shared";

/* The Jarvis desk-panels machine's pure half (pluggable-core slice 7): the
 * caps, the unsupported-spec sentinel and every roster fold, shared by every
 * application core — the RxJS `createJarvisPanelsMachine` and the sibling
 * cores' native machines fold the very same functions. rxjs-free by rule. */

/** Live desk panels are capped at four; a spawn beyond the cap evicts the
 * oldest (index 0) — FIFO. An edit to an already-live panelId never counts
 * toward this cap (see `applyPanelEvent`'s doc). A DOCKED panel (`docked:
 * true`) is invisible to this cap in both directions: it is never counted
 * toward it and never evicted by it — the cap only ever counts and evicts
 * among the `!docked` ("floating") subset. */
export const MAX_LIVE_PANELS: number = DOMAIN_MAX_LIVE_PANELS;

/** Docked desk panels (docked into the workspace, out of the floating
 * overlay) are capped separately, at four — see `dockPanel` / `restoreDockedPanel`. */
export const MAX_DOCKED_PANELS: number = DOMAIN_MAX_DOCKED_PANELS;

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

// A named tag (rather than an inline `{ type: "panel" }` literal) so
// `Extract<JarvisEvent, ...>` never takes an inline object type argument —
// mirrors JarvisMachine.ts's identical ConfirmRequestTag idiom (the repo's
// `no-restricted-syntax` bans inline object types even inside a type alias).
interface PanelTag {
  readonly type: "panel";
}
export type PanelEvent = Extract<JarvisEvent, PanelTag>;

export function isPanelEvent(event: JarvisEvent): event is PanelEvent {
  return event.type === "panel";
}

export function toPanelInstance(event: PanelEvent): PanelInstance {
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
export function applyPanelEvent(
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
export function dockPanelInState(
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
export function undockPanelInState(
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
export function restoreDockedPanelInState(
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

/** The raw dismissal: drop `panelId` from the roster and nothing else (a
 * docked panel's leaf is the composition's concern — see
 * `Presenters.dismissPanel`). */
export function dismissPanelInState(
  panels: readonly PanelInstance[],
  panelId: string,
): readonly PanelInstance[] {
  return panels.filter((p) => {
    return p.panelId !== panelId;
  });
}
