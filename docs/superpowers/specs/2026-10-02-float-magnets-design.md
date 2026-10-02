# Floating panels as magnets — Design

**Date:** 2026-10-02
**Status:** Approved in conversation 2026-10-02 (every decision below confirmed by the user); awaiting review of this written form.
**Parent spec:** [2026-09-15-dockview-floats-and-presets-design.md](2026-09-15-dockview-floats-and-presets-design.md) §6a — floating groups. This document adds attach / move-together / detach on top of the shipped floats.
**Origin:** a spike on branch `worktree-spike-float-magnets` (local commit `3482ed985`, throwaway) that proved the mechanism in the browser.

## 1. Intent

A floating panel dragged close to another floating panel snaps flush against
it, like a magnet. Released there, the two are **attached**: they look and
move like one window. Dragging any attached panel moves the whole cluster.
There are two deliberate ways to pull a panel back out.

Success means, in a real browser on both web clients:

- Two floats dragged flush become one floating window; a reload brings that
  window back at full width with both panels visible.
- A plain drag on either panel's header moves both.
- A detach button in the header, or an Option-drag of the header, separates a
  panel from its cluster.
- The existing float behaviours (⚓ dock home, Shift-drag to dock, pop-out,
  width-locked rails) still hold for a cluster's members.

### Decided scope

| Question | Decision |
|---|---|
| Detach gesture | Both: a header **detach button** shown only while attached, and **Option-drag** of a member's header. |
| Can a cluster (2+ panels) attach to another float? | **No** in v1. It snaps flush and stays a separate window. Recorded as a follow-up in `docs/STATUS.md`. |
| Cues | **Before release:** a thin accent line along the edge that would attach. **After:** the cluster reads as one window (one card outline, grid-style sash, detach buttons); no badge. Quieter (snap only) and louder (outline around the whole target) variants are recorded as exploration options in `docs/STATUS.md`. |
| Width-locked panels, side by side | Always allowed; each panel keeps its own width rule. |
| Width-locked panels, stacked | Allowed; a free-width panel **adopts** the locked width (either direction). Never refused. |
| Snap targets | Other floats only. Not the container edges, not the grid's sashes. |
| Testing | Pure-geometry units, engine units, ui-contract specs, an e2e scenario, **and** a visual golden of the attached cluster. |

### Not in scope

- dockview's `smartGuides` option. It is declared in the free `dockview-core`
  types but implemented only in the paid `dockview-enterprise` package
  (verified 2026-10-02: `ENTERPRISE_MODULE_NAMES` in `main.esm.mjs` lists
  `SmartGuides`; `AllModules` does not). The snapping here is ours.
- Linking separate windows (moving partners ourselves each frame). Rejected:
  it would make us own persistence of links, resize propagation, z-order and
  a per-frame move loop, for a result dockview's nested float already gives.
- Attaching to the grid, or to a popped-out window.

## 2. Mechanism — one dockview floating window per cluster

dockview 8.3.1's floating window can host a **nested split layout** of
groups, not only one group (`DockviewFloatingGroupPanel.gridview`;
serialised as `floatingGroups[n].grid` instead of `.data`). The spike showed
that `group.api.moveTo({ group: target, position: "right" | "bottom" })`
on a floating target does exactly this: the moving group joins the target's
window, the two windows become one, and `toJSON → fromJSON` round-trips it.

So an **attached cluster is a floating window with more than one group.**
Moving, resizing between members (dockview's own sash), serialising and
restoring are dockview's; this design owns:

1. the snap geometry while a float is dragged;
2. the attach decision on release;
3. the whole-window move from any member's header;
4. detach (both gestures);
5. the width rules for a cluster;
6. the cues;
7. reporting attached state to the client for the header button.

The only private dockview reach this adds is
`component.getFloatingWindowForGroup(group)`, used to find a member's window
(for the move handle and to size the window on attach). It joins
`gridview.moveView` in the `DockviewInternals` interface, with the same
"a dockview upgrade must re-verify this" comment, and the engine test that
restores a side-by-side cluster is the test that fails if it disappears.

## 3. Components

All in `packages/layout-dockview`, so both web clients inherit it through
their existing `DockviewLayoutEngine` bridge.

### 3.1 `src/floatMagnets.ts` — pure geometry (new)

No DOM, no dockview import. Boxes are `{ left, top, width, height }`.

```ts
export const FLOAT_SNAP_DISTANCE_PX = 14;
export const FLOAT_FLUSH_TOLERANCE_PX = 12;

export type AttachSide = "left" | "right" | "top" | "bottom";

export interface SnapResult {
  readonly left: number;
  readonly top: number;
  /** The sibling edge the drag engaged on, or null when nothing snapped. */
  readonly engaged: { readonly other: Box; readonly side: AttachSide } | null;
}

/** The dragged box pulled flush to the nearest sibling edge within
 * FLOAT_SNAP_DISTANCE_PX, with its top (or left) aligned too when that is
 * also within range. `suspended` (Option held) returns the proposal as is. */
export function snapToSiblings(
  proposed: Box,
  others: readonly Box[],
  suspended: boolean,
): SnapResult;

/** Which side of `theirs` the box `mine` sits flush against (within
 * FLOAT_FLUSH_TOLERANCE_PX along a shared edge), or null — a corner-only
 * touch is null. */
export function flushSideOf(mine: Box, theirs: Box): AttachSide | null;

/** The width a cluster member takes when `incoming` stacks under or over
 * `target`: a lock wins over a free width; two locks keep the target's. */
export function stackedWidthFor(
  target: { width: number; lock: number | undefined },
  incoming: { width: number; lock: number | undefined },
): number;
```

`AttachSide` is relative to the **target**: `"right"` means the newcomer
sits to the target's right, which is also the `position` dockview's
`moveTo` expects.

### 3.2 `createDockEngine.ts` — wiring

- **Option** `transformFloatingGroupDrag` on the dockview component calls
  `snapToSiblings(proposed, others, modifiers.altKey)` and returns its
  `{ top, left }`. The `engaged` edge is kept in a module-level
  `snapEngaged` variable for the cue and the release decision.
  `context.others` is dockview's own snapshot of the sibling floats' boxes,
  taken at drag start, in container coordinates.
- **Attach on release** (`attachFloatOnRelease`, a capture-phase `pointerup`
  on `window`, registered next to `dockFloatOnRelease`): runs only when a
  head press is moving a float (`floatBeingMoved`), the float's window holds
  **one** group, neither Option nor Shift is held, and `flushSideOf` finds a
  side against another float's box. Then, in order:
  1. record both boxes' union and the newcomer's extent along the shared
     axis;
  2. `newcomer.api.moveTo({ group: target, position: side })`;
  3. `window.position(union)` on the target's floating window;
  4. `newcomer.api.setSize` to its recorded width (side by side) or height
     (stacked); stacked members all take `stackedWidthFor(...)`.
  Shift-release keeps today's meaning (dock home) and never attaches.
- **Move from any member's header** (`moveFloatFromHead`, extended): when
  the pressed group's window holds several groups, the forwarded
  `pointerdown` goes to the **window's anchor group's** void container —
  the one dockview wired the overlay drag to — instead of the pressed
  group's own. Found through `getFloatingWindowForGroup(group).group`.
- **Option-press detach** (`moveFloatFromHead`, extended): when the pressed
  group's window holds several groups and `event.altKey` is set, call
  `detachPanel` first, then forward the press to the **new** window's void
  container so the drag continues with the detached panel under the
  pointer. Snapping stays suspended for that drag because Option is held;
  if the user releases Option mid-drag, snapping resumes but attach on
  release is still refused for that drag (a `detachedThisDrag` flag,
  cleared on `pointerup`), so a detach cannot re-attach in one motion.
- **`detachPanel(panelId)`** (new public API): no-op unless the panel's
  window holds several groups. Otherwise `api.addFloatingGroup(group, rect)`
  with the group's current on-screen rect in container coordinates — the
  same call the ⚓ float button makes — which dockview implements by
  removing the group from its window, leaving the rest where it is. The
  remaining window is then resized by the removed extent along the split's
  axis (`window.position`), so it shrinks rather than leaving a void.
- **`onAttachedChange(panelIds)`** (new option): the whole sorted set of
  panel ids whose floating window holds more than one group. Emitted from
  the same `onDidLayoutChange` path as `onFloatsChange`, only when the set
  changes.
- **Width rules.** `fitLockedFloatBoxes` becomes cluster-aware. For each
  floating window: if it holds one group, unchanged. If it holds several
  laid out **side by side** (its serialised `grid.orientation` is
  `HORIZONTAL`), the window is never width-locked as a whole; each locked
  member keeps `min = max` on its own group (dockview already honours
  per-group constraints inside the nested split), free members resize
  through the sash. If **stacked** (`VERTICAL`), every member is set to
  `stackedWidthFor` over the members' locks, and the window is width-locked
  (`rtc-dock-float-fixed-width`) only when at least one member is locked.
  Orientation is read from `api.toJSON()`, not the DOM — at construction
  the members are not laid out yet and all report the same rect, which is
  what squeezed the spike's restored pair to one panel's width.
- **Cue.** `.rtc-attach-preview`, one engine-owned element like
  `.rtc-dock-preview`: shown while `snapEngaged` is set **and** the drop
  would attach (lone float, no Option/Shift); positioned along the engaged
  edge on the **target's** side, 2px thick, full length of the shared span;
  removed on `pointerup`/`pointercancel` and whenever the conditions stop
  holding.
- **Dock home / pop-out of a member.** No new code: `moveTo` into the grid
  and `addPopoutGroup` both take the group out of its window, which is the
  same operation as detach from dockview's point of view. The remaining
  window shrinks through the same resize step `detachPanel` uses, factored
  as `shrinkWindowAfterLeaving(window, removedExtent, axis)` and called
  from `settleFloatTransitions` when a window's group count drops.

### 3.3 Clients

`DockviewLayoutEngine` (React and Solid) passes `onAttachedChange` and keeps
an `attached` set beside `floating`, cleared on the same tab-switch / reset
paths that clear `floating`. `PanelHeadControls` (both) gains:

```tsx
{attachedHere ? (
  <button type="button"
    data-testid={`panel-${panelId}-detach`}
    className={styles.panelControl}
    aria-label={`Detach ${title}`} title={`Detach ${title}`}
    onClick={onDetach}>⇱</button>
) : null}
```

placed immediately before the ⚓ dock control. `onDetach` calls
`engine.detachPanel(panelId)`.

### 3.4 Styles (`dockview-hud.css`, `PanelHead.module.css`)

- `.rtc-attach-preview`: `position: absolute; pointer-events: none;
  background: var(--accent); z-index` above the floats; 2px on its short
  side.
- The sash inside a floating window (`.dv-resize-container .dv-sash`) takes
  the grid sash's gutter width and hover colour so the seam reads as a
  split.
- No per-skin rule unless the golden shows one is needed.

## 4. Behaviour in detail

### 4.1 Snapping

While a float is dragged: for every other float that overlaps the dragged
box on the perpendicular axis, if the dragged box's leading or trailing edge
is within 14px of the sibling's opposite edge, the dragged box moves flush to
it; if, in addition, their tops (side by side) or lefts (stacked) are within
14px, those align too. The nearest qualifying edge wins. Option held: no
snapping and no cue. A cluster being dragged snaps the same way (its window
is one box) but never attaches.

### 4.2 Attach sizing

| Arrangement | Window | Newcomer | Target |
|---|---|---|---|
| Side by side | union of both boxes; height = the taller | keeps its width | keeps its width |
| Stacked | union; width = `stackedWidthFor` | keeps its height | keeps its height |

A free-width member of a stacked cluster that adopted a locked width keeps
it only while in the cluster; detaching restores no earlier width (it keeps
the adopted one, as any float keeps its last size).

### 4.3 Detach sizing

The detached panel floats at its current on-screen rect. The remaining
window keeps its top-left and loses the removed extent along the split
axis: a side-by-side pair losing its right member keeps its left edge and
narrows; losing its left member moves its left edge right by the removed
width so the surviving panel does not slide.

### 4.4 Interactions with existing float rules

- **Shift-drag dock home** of a member: unchanged; the member leaves the
  window (4.3 shrink applies).
- **⚓ dock home**: unchanged; same shrink.
- **Pop-out** of a member: unchanged; same shrink.
- **Design pins / float-suspended pins** (`floatSuspendedPins`): per panel,
  unaffected — a member docking home re-clamps as today.
- **`rtcFloatSizes`** (remembered home extent): per panel, unaffected.
- **Reconcile of dynamic panels** (`DockParkedGrid.where === "float"`): a
  parked member is restored as a **lone** float at the cluster's box, since
  the cluster may no longer exist by then. Accepted for v1; follow-up.
- **`floatingGroupBounds: "boundedWithinViewport"`**: a cluster's window is
  clamped as any float is; a union that would exceed the container is
  clamped by dockview after `window.position`, which may shrink the
  newcomer — acceptable, it mirrors a float dragged against the edge.

### 4.5 Persistence

Nothing new is written. dockview already serialises a multi-group window as
`floatingGroups[n].grid` and restores it; `rtcFloatSizes`, `rtcDesignPins`
and `rtcBlobVersion` are untouched. `DOCK_BLOB_VERSION` stays **3**: an
older blob has no cluster and loads unchanged. `withoutFloatingGroups`
(preset scrub) already drops the whole `floatingGroups` array, clusters
included.

## 5. Testing

Every test is written before its behaviour, and each engine/geometry test is
proven with a mutant via `node scripts/mutation-check.mjs` (a SURVIVED row
is a finding about the test). Timer-driven waits use fake timers.

### 5.1 `floatMagnets.test.ts` (pure)

- snaps at exactly 14px, not at 15; on both axes; nearest edge wins when two
  siblings qualify;
- aligns the top (or left) only when it is within range too;
- `suspended: true` returns the proposal untouched and `engaged: null`;
- `flushSideOf` returns each of the four sides; null for a corner-only touch
  and for a 13px gap;
- `stackedWidthFor`: free+free → target's width; locked+free → the lock
  (both orders); locked+locked → the target's.

### 5.2 `createDockEngine.test.ts` (jsdom, bare-dockview harness)

- **Reload (written first, fails on today's code):** a blob holding two
  360-locked panels side by side restores to one floating window whose box
  is as wide as both and whose members both measure 360.
- attach side by side → one window, members keep their widths, height is the
  taller; attach stacked → one window, the free member adopts the lock;
- a two-member window dragged flush against a third float does not attach;
- `detachPanel`: member pops out at its rect; the remainder shrinks per 4.3
  (both the left-member and right-member cases); no-op on a lone float;
- `onAttachedChange`: fires with the sorted set on attach and on detach, not
  on an unrelated layout change;
- `fitLockedFloatBoxes`: a side-by-side cluster carries no
  `rtc-dock-float-fixed-width`; a stacked locked cluster does.

Pointer gestures (snap, Option, cue) are not unit-tested in jsdom — rects
are zero there — they are covered by 5.4.

### 5.3 ui-contract (both frameworks)

- the detach button renders only for an attached panel, with the stated
  test id and label, and calls `detachPanel(panelId)`;
- it is absent for a lone float and for a docked panel.

### 5.4 E2E — `tests/browser/playwright/layout.spec.ts` (both clients)

One scenario, the real pointer gesture: float Analytics and Positions;
Option-drag them apart; drag Positions to 10px right of Analytics with an
8px vertical offset → exactly one `.dv-resize-container`, holding both
heads, top-aligned; drag by Positions' head → the window moved; reload →
still one window, both panels full width; Option-drag Positions out → two
windows; drag flush again, then click `panel-fx-positions-detach` → two
windows. Assertions read rects, not screenshots; waits are on conditions.

### 5.5 Visual golden

`shell/layout-dockview-attached` in `@rtc/ui-contract`'s scenario matrix,
component `DockviewEngineAttached` in both clients' visual registries,
seeded from `attachedFxBlob.ts` captured **honestly** (a real engine save
after a real attach at the 1200×700 stage, recorded through the
`InMemoryDockLayoutStore` tap, exactly as `floatingFxBlob.ts` was). Fifth
single-engine scenario: no in-house twin exists, `visual:engine-parity`
skips it. Generated from react, asserted by both. The snap cue is transient
and gets no golden.

## 6. Delivery

One PR after the spec and plan land, under `shipping-repo-changes`: the
engine, both clients, tests, the golden regen dispatch, `README.md` of
`layout-dockview`, and the `docs/STATUS.md` follow-ups:

- clusters attaching to other floats;
- the quieter (snap only) and louder (outline around the target) cue
  variants;
- a parked cluster member restores as a lone float after a dynamic-panel
  reconcile;
- `getFloatingWindowForGroup` joins `moveView` on the dockview-upgrade
  watch list.

The spike branch `worktree-spike-float-magnets` is deleted once the
implementation PR is open; nothing from it is cherry-picked.
