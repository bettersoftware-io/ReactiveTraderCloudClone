import { createDockview, type DockviewApi, type DockviewTheme } from "dockview";

import { compensateGap } from "#/dockBlob";
import { convertSeed, type DockDesignPin, type DockSeedNode } from "#/dockSeed";
import { HookActionsRenderer } from "#/HookActionsRenderer";
import { HookContentRenderer } from "#/HookContentRenderer";
import { HookTabRenderer } from "#/HookTabRenderer";

const RTC_TAB_COMPONENT = "rtc-tab";

/** Gap between groups, in px — the in-house engine's 7px drag-handle track
 * (`InhouseLayoutEngine.module.css` `.handle`), so two panels sit exactly as
 * far apart under dockview as they do in-house. Dockview applies it as a
 * margin on every grid child and centres its sash in the resulting gutter. */
export const GROUP_GAP_PX = 7;

// dockview's own built-in themes (theme.ts: themeDark, themeAbyss, …) apply
// their `className` via the `theme` OPTION, not via a class a consumer puts
// on the container. That option lands the class on dockview's own internal
// "shell" element — the closest ancestor of `.dv-dockview` — deliberately
// NOT on `.dv-dockview` itself (dockview's own source comment: doing so
// "would block consumer overrides"). CSS custom properties resolve from the
// NEAREST ancestor with an explicit declaration, not by selector specificity,
// so a `dockview-theme-rtc` class applied only to an outer wrapper div (as
// the client shells do, for other styling purposes) sits further from
// `.dv-dockview` than the shell dockview creates internally — and loses. With
// no `theme` option supplied at all, dockview defaults to `themeAbyss`,
// which is exactly the unthemed dark chrome every skin/mode rendered
// identically (visual-tier finding, task-7 report). Passing our OWN
// `DockviewTheme` here (matching `dockview-hud.css`'s `.dockview-theme-rtc`
// selector) is the same mechanism dockview's built-ins use, so the mapped
// `--dv-*` vars finally win the cascade at the correct DOM level.
const RTC_DOCKVIEW_THEME: DockviewTheme = {
  name: "rtc",
  className: "dockview-theme-rtc",
  gap: GROUP_GAP_PX,
};

/** Every hook has the same `(panelId, element) => dispose` shape: dockview
 * owns the element, the client fills it with framework-native nodes and
 * tears them down through the returned disposer. Only `mount` (the panel
 * body) is mandatory; `mountTab` and `mountActions` are what let the
 * client's OWN panel header take over dockview's tab bar — see
 * `HookTabRenderer` / `HookActionsRenderer`. */
export interface DockPanelHooks {
  title(panelId: string): string;
  /** Mount framework-native content into the element Dockview owns; returns the disposer. */
  mount(panelId: string, element: HTMLElement): () => void;
  /** Mount the panel's header slot (its head tabs, or its title) into the
   * panel's TAB element — dockview's drag surface. Absent → the tab shows the
   * `title()` text. */
  mountTab?(panelId: string, element: HTMLElement): () => void;
  /** Mount the panel's header controls (collapse / maximize) into the
   * right-hand actions slot of whichever group the panel is currently the
   * ACTIVE panel of. Remounted on every active-panel change, so `panelId` is
   * always the one the controls should act on. Absent → no actions slot. */
  mountActions?(panelId: string, element: HTMLElement): () => void;
  /** How far `panelId`'s maximize reaches — see {@link DockMaximizeScope}.
   * Absent → `"root"`. */
  maximizeScope?(panelId: string): DockMaximizeScope;
}

/** The in-house `PanelSpec.maximizeScope`: `"root"` (the default) strips
 * every other panel in the dock; `"nearest-column"` strips only the panels
 * of the maximized panel's nearest enclosing column split — the design's
 * rail panels fill their own rail and leave the main column alone. */
export type DockMaximizeScope = "root" | "nearest-column";

export interface DockEngineOptions {
  container: HTMLElement;
  seed: DockSeedNode;
  blob: string | null;
  panels: DockPanelHooks;
  // Property (slot) syntax, not a method: the declarer never knows what gets
  // attached, so rtc/name-functions-by-effect exempts it — see
  // docs/handler-naming.md's slot-vs-handler doctrine.
  onLayoutChange: (blob: string) => void;
  /** Fired whenever the set of strips OR any strip's orientation changes —
   * after a collapse or expand, with the whole current map. A collapse can
   * re-orient panels other than the one named (see {@link DockEngine.collapsePanel}),
   * so this, not the intent's own result, is the client's source of truth
   * for which restore bar to render. Not fired at construction (no strips). */
  onStripsChange?: (strips: DockStripMap) => void;
  /** Debounce for onLayoutChange serialisation; default 250. Tests pass 0. */
  debounceMs?: number;
}

/** The bar a collapsed group is clamped to, matching the in-house engine's
 * strips so the two engines strip a panel to the same bar: a group whose
 * siblings run side by side (a horizontal split) shrinks to a 32px-wide
 * full-height column — the in-house vertical `.panel[data-strip]`, 32px
 * outer with 1px borders inside — and one whose siblings stack (a vertical
 * split) shrinks to a 32px-tall full-width bar. One bar size both ways. */
/** Set on the consumer's container for the life of an intent's glide; the
 *  stylesheet's `[data-dock-glide]` rules transition dockview's inline
 *  geometry while it is present. */
export const DOCK_GLIDE_ATTRIBUTE = "data-dock-glide";
/** The in-house glide is 0.34s (InhouseLayoutEngine.module.css `.cell` /
 *  `.panel`, PROTO's panTrans); the attribute outlives it by a frame or two
 *  so the tail of the transition is never cut off — dropping the transition
 *  property mid-flight snaps to the end value. */
export const GLIDE_ATTRIBUTE_MS = 400;
const STRIP_WIDTH_PX = 32;
const STRIP_HEIGHT_PX = 32;

/** Which way a collapsed panel's strip reads: `"vertical"` for the 32px
 * column (its label runs bottom-to-top), `"horizontal"` for the 32px bar —
 * the in-house engine's `data-strip-orientation`, decided here from the
 * axis the panel's group reclaims along. */
export type DockStripOrientation = "vertical" | "horizontal";

/** Every currently collapsed panel and which way its strip reads. */
export type DockStripMap = Readonly<Record<string, DockStripOrientation>>;

export interface DockEngine {
  /** Fill the panel's maximize boundary with it — the whole dock, or its
   * nearest enclosing column for a `"nearest-column"` panel — by stripping
   * every OTHER panel inside that boundary, exactly the in-house engine's
   * render-time policy (`maximizeBoundaryPath` + `strippedPanelIds`).
   * Dockview's own `maximize()` is deliberately not used: it HIDES the
   * other groups and knows no scope. One panel at a time, as the
   * LayoutMachine holds one; a panel the user had already collapsed is
   * left alone. Idempotent; a no-op for an unknown panel. */
  maximizePanel(panelId: string): void;
  /** Restore every panel the current maximize stripped — and only those:
   * a strip the user collapsed (before, or while maximized) stays. No-op
   * when nothing is maximized. */
  exitMaximize(): void;
  /** Strip this panel to a bar along the axis its space reclaims on (see
   * {@link STRIP_WIDTH_PX}). That axis is the in-house engine's `stripDir`:
   * the nearest enclosing split that is NOT itself fully stripped — so the
   * last panel of a rail column to collapse flips the WHOLE column to 32px
   * vertical strips stacked down the rail, exactly as in-house, instead of
   * leaving two 32px bars atop a full-width empty column. Orientations
   * therefore reach the client through `onStripsChange`, not a return
   * value. Idempotent; a no-op for an unknown panel. */
  collapsePanel(panelId: string): void;
  /** Restore a collapsed panel to the exact size/constraints it had before.
   * No-op unless this engine collapsed it. */
  expandPanel(panelId: string): void;
  groupCount(): number;
  dispose(): void;
}

/** What a group looked like before it was stripped, so expand restores rather
 * than guesses. Constraints are captured too: dockview's default minimum width
 * is not a documented constant, so reading the real values back beats hardcoding
 * a floor that a dockview upgrade could silently change. */
/** What a collapsed panel's group looked like before, on BOTH axes: the
 * natural axis (its own parent split's — restored on expand) and the
 * orthogonal one (clamped instead while the whole parent split is stripped
 * and the strip reads the other way). */
interface StripRecord {
  natural: DockStripOrientation;
  size: number;
  minimum: number;
  maximum: number;
  orthogonalMinimum: number;
  orthogonalMaximum: number;
}

/** The maximize in force: which panel, and which panels IT stripped (the
 * user's own strips are not listed, so restore leaves them be). */
interface MaximizeRecord {
  panelId: string;
  stripped: readonly string[];
}

export function createDockEngine(opts: DockEngineOptions): DockEngine {
  const api: DockviewApi = createDockview(opts.container, {
    createComponent: () => {
      return new HookContentRenderer(opts.panels);
    },
    // Panel close/reopen is out of v1 scope — see HookTabRenderer's own doc
    // comment for why this replaces the default tab renderer entirely
    // instead of hiding the close button with CSS. `defaultTabComponent`
    // must ALSO be set: without a `tabComponent` id on the panel (which
    // `fromJSON`-restored panels never carry), dockview falls back to its
    // own built-in `DefaultTab` — WITH the close action — and never calls
    // `createTabComponent` at all.
    defaultTabComponent: RTC_TAB_COMPONENT,
    createTabComponent: () => {
      return new HookTabRenderer(opts.panels);
    },
    // The group's right-hand actions slot hosts the active panel's own
    // collapse / maximize controls — the in-house header's right half.
    createRightHeaderActionComponent: actionsFactory(opts.panels),
    // A lone tab stretches across the whole bar (padding 0), so a panel's
    // head slot — FX's Live Rates ▸ Watchlist tabs with the CHARTS chip
    // pushed to the far right — lays out exactly as the in-house 38px
    // header does. Groups holding several tabs fall back to content width.
    singleTabMode: "fullwidth",
    // See RTC_DOCKVIEW_THEME's own doc comment: this is what actually routes
    // the HUD theme's --dv-* variables past dockview's internal defaults.
    theme: RTC_DOCKVIEW_THEME,
  });

  const width = opts.container.clientWidth || 1200;
  const height = opts.container.clientHeight || 800;

  // dockview-core needs an explicit, real-dimensioned layout() call before
  // fromJSON restores a tree: absent one, its internal grid is still at its
  // 0×0 construction size (a fresh container hasn't been measured yet — e.g.
  // a portal mount that hasn't painted, or jsdom, which never resizes at
  // all), and each SplitView falls back to distributing space EVENLY among
  // children instead of honouring the sizes embedded in the restored JSON —
  // seed/blob proportions silently collapse to ~50/50 (confirmed empirically:
  // without this call every leaf comes back sized 100/100 regardless of the
  // 0.75/0.25 input; with it, sizes land exactly on the requested ratio).
  // dockview's own ResizeObserver will proportionally rescale from here once
  // the container's real size is known, so a stale fallback self-corrects.
  api.layout(width, height);

  const restored = loadBlobOrSeed(api, opts, width, height);
  applyTitles(api, opts.panels);

  const debounceMs = opts.debounceMs ?? 250;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function serializeLayout(): void {
    // See compensateGap: dockview serialises gap-shaved rendered sizes,
    // which would restore a little differently on every load.
    // `rtcDesignPins` rides along inside the blob (dockview's fromJSON
    // ignores unknown top-level keys) so a still-pinned rail stays pinned
    // across reloads, and a released one stays released — the in-house
    // engine's "first drag converts the split for good", persisted.
    // `rtcStripGeometry` (present only while strips exist) rides the same
    // way: the grid itself serialises AS RENDERED — bars included — so
    // without it a reload's re-applied collapse would remember the restored
    // bar (clamped up to dockview's ~100px default minimum) as the size to
    // restore. The first save also expires any seeds the bridge's intent
    // replay did not consume: past this point they describe strips the
    // machine never re-applied, and a later collapse must measure live.
    seededStripSizes.clear();
    seededFlipSizes.clear();
    const stripGeometry = stripGeometrySidecar();
    opts.onLayoutChange(
      JSON.stringify({
        ...compensateGap(api.toJSON(), GROUP_GAP_PX),
        rtcDesignPins: intactDesignPins(),
        ...(stripGeometry === undefined
          ? {}
          : { rtcStripGeometry: stripGeometry }),
      }),
    );
  }

  /** The strip machinery's restore sizes, for the blob: what recordStrip
   * and the flip pass need to remember across a reload but cannot
   * re-measure there (the serialised grid holds the bars). Undefined while
   * nothing is stripped, so a strip-free blob keeps its legacy shape. */
  function stripGeometrySidecar(): StripGeometrySidecar | undefined {
    if (records.size === 0) {
      return undefined;
    }

    const recordSizes: Record<string, PersistedStripSize> = {};

    for (const [panelId, record] of records) {
      recordSizes[panelId] = { size: record.size };
    }

    const flips: PersistedFlip[] = [];

    for (const [split, size] of flippedSplits) {
      const panelIds = [...records.keys()]
        .filter((panelId) => {
          const group = groupOf(panelId);

          return group !== undefined && split.contains(group.element);
        })
        .sort();

      if (panelIds.length > 0) {
        flips.push({ panelIds, size });
      }
    }

    return { records: recordSizes, flips };
  }

  const changeSub = api.onDidLayoutChange(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      serializeLayout();
    }, debounceMs);
  });

  // Dockview's dock has NO collapse primitive. `setCollapsed`/`isCollapsed`
  // exist in dockview-core but only for EDGE groups (shell-docked sidebars),
  // which these grid groups are not — so collapse is emulated by clamping the
  // group's size, which is exactly how dockview's own edge groups do it
  // (their `restoreExpandedSize` remembers the pre-collapse size the same way
  // this map does).
  const records = new Map<string, StripRecord>();
  // Per split holding at least one strip: every direct member's size at the
  // moment the split's FIRST strip was recorded — the world its strips'
  // expands put back. A panel collapsing while a sibling is already a bar
  // renders at an INFLATED size (it absorbed the bar's space), so only this
  // first-strip snapshot knows what each panel truly owned; and sequential
  // expands must re-assert the whole world at the end, because dockview
  // spreads each restore's delta over whichever live neighbours it favours,
  // not over the panel holding the borrowed surplus. Dropped when the last
  // strip of the split expands.
  const preStripWorlds = new Map<Element, Map<string, number>>();
  // A split whose every group is a strip reclaims along its PARENT's axis
  // (the in-house `stripDir`): its own size on that axis is remembered here
  // while it is flipped, and restored the moment one of its strips expands.
  const flippedSplits = new Map<Element, number>();
  // Sizes the blob's sidecar carried across a reload, consumed by the
  // bridge's intent replay (recordStrip and the flip pass) and expired at
  // the first save — see serializeLayout.
  const seededStripSizes = new Map(restored.stripSizes);
  const seededFlipSizes = new Map(restored.flipSizes);
  let lastStrips: DockStripMap = {};
  // In-house maximize is a POLICY over strips, not a geometry primitive:
  // every leaf under the maximize boundary except the maximized panel is a
  // strip. Dockview's `maximize()` is a different thing — gridview's
  // `maximizeView` hides every other group (`setChildVisible(false)`) and
  // has no notion of scope — so maximize is emulated as exactly that
  // policy over the collapse machinery, and the siblings shrink into the
  // same bars in-house renders, glide included. `stripped` is what THIS
  // maximize collapsed, so restore puts back only those.
  let maximized: MaximizeRecord | null = null;

  // The in-house engine glides a collapse / expand / maximize / restore over
  // 0.34s (its `.cell` / `.panel` transitions) and NOTHING else — a sash drag
  // or a window resize lands instantly. Dockview positions every group and
  // sash through inline `left/top/width/height` styles, so the same glide is
  // a CSS transition on those (dockview-hud.css, `[data-dock-glide]`) — but
  // dockview rewrites them on drags and resizes too, which must not animate.
  // Hence the gate is INVERTED from in-house's "disable while dragging": the
  // attribute is on only around an intent, which are the four calls below,
  // and off again once the transition has run its course.
  let glideTimer: ReturnType<typeof setTimeout> | null = null;

  function glide(mutate: () => void): void {
    opts.container.setAttribute(DOCK_GLIDE_ATTRIBUTE, "");

    if (glideTimer !== null) {
      clearTimeout(glideTimer);
    }

    glideTimer = setTimeout(() => {
      glideTimer = null;
      opts.container.removeAttribute(DOCK_GLIDE_ATTRIBUTE);
    }, GLIDE_ATTRIBUTE_MS);
    mutate();
  }

  function groupOf(panelId: string): SizableGroup | undefined {
    return api.getPanel(panelId)?.group;
  }

  /** Remembers `panelId`'s group's pre-strip geometry so settleStrips can
   * clamp it. False — and nothing recorded — for an unknown panel or one
   * that already is a strip (a second record would remember the BAR as the
   * size to restore). */
  function recordStrip(panelId: string): boolean {
    const panel = api.getPanel(panelId);

    if (panel === undefined || records.has(panelId)) {
      return false;
    }

    // In-house `collapsed` names a PANEL; dockview sizes a GROUP, and a group
    // can hold several panels as tabs. Clamping a shared group would strip
    // this panel's tab siblings too, so eject it into its own group first and
    // keep collapse meaning exactly the panel it names. `moveTo` with a
    // non-center position relative to the panel's CURRENT group is what
    // creates that new group — there is no separate "eject" call.
    if (panel.group.panels.length > 1) {
      panel.api.moveTo({ group: panel.group, position: "right" });
    }

    // Re-read: the move above reassigned `panel.group`.
    const group = panel.group;
    const natural = stripOrientationOf(group);
    const naturalAxis = axisOf(group, natural);
    const orthogonalAxis = axisOf(group, opposite(natural));
    const world = worldAround(group, natural);

    // A blob reload restores the grid at the BAR (clamped up to dockview's
    // default minimum), so on the bridge's post-reload re-collapse the live
    // measurement is not the size to restore — the sidecar's persisted size
    // wins when one rode in for this panel.
    const seededSize = seededStripSizes.get(panelId);
    seededStripSizes.delete(panelId);

    records.set(panelId, {
      natural,
      size: seededSize ?? world?.get(panelId) ?? naturalAxis.size(),
      minimum: naturalAxis.minimum(),
      maximum: naturalAxis.maximum(),
      orthogonalMinimum: orthogonalAxis.minimum(),
      orthogonalMaximum: orthogonalAxis.maximum(),
    });

    return true;
  }

  /** The pre-strip world of `group`'s split, capturing it now if this is the
   * split's first strip — every direct member still sits at the size it owns,
   * so this is the one moment the true allocation is readable. A later strip
   * finds its own true size in here rather than remembering the inflated one
   * it renders at once earlier bars' space has landed on it. Null only for a
   * group outside any split. */
  function worldAround(
    group: SizableGroup,
    natural: DockStripOrientation,
  ): ReadonlyMap<string, number> | null {
    const split = group.element.closest(SPLIT_SELECTOR);

    if (split === null) {
      return null;
    }

    const known = preStripWorlds.get(split);

    if (known !== undefined) {
      return known;
    }

    const world = new Map<string, number>();

    for (const member of directMembersOf(split)) {
      const size = axisOf(member, natural).size();

      for (const heldPanel of member.panels) {
        // After a blob reload the grid renders the serialised bars, so a
        // live measurement here is polluted (a restored bar's clamp, or a
        // sibling inflated by absorbing it). The sidecar's persisted size is
        // that panel's true pre-collapse allocation — prefer it, and leave
        // the seed in place for recordStrip to consume.
        world.set(heldPanel.id, seededStripSizes.get(heldPanel.id) ?? size);
      }
    }

    preStripWorlds.set(split, world);

    return world;
  }

  /** `split`'s own groups in DOM order — the ones whose nearest split IS
   * `split`, not a nested child split's. */
  function directMembersOf(split: Element): readonly SizableGroup[] {
    const members: SizableGroup[] = [];

    for (const element of split.querySelectorAll(GROUP_SELECTOR)) {
      if (element.closest(SPLIT_SELECTOR) !== split) {
        continue;
      }

      const member = api.groups.find((candidate) => {
        return candidate.element === element;
      });

      if (member !== undefined) {
        members.push(member);
      }
    }

    return members;
  }

  /** Puts every strip-free split's pre-strip world back and forgets it. Runs
   * after expands and maximize exits: the LAST restore in a split cannot land
   * everyone right on its own — dockview resizes a view by moving the delta
   * to/from the views AFTER it (from the end) before the ones before it, not
   * to/from the panel holding the borrowed surplus. Members are re-asserted
   * FIRST to SECOND-TO-LAST, in order: each delta then parks on the
   * still-unasserted suffix, and by the time the walk reaches the end the
   * suffix holds exactly what conservation says it must — the last member
   * lands on its own size without being asserted at all. */
  function settleStripFreeWorlds(): void {
    for (const [split, world] of [...preStripWorlds]) {
      if (holdsStrip(split)) {
        continue;
      }

      preStripWorlds.delete(split);
      const along = orientationAgainst(split);
      const members = directMembersOf(split);

      for (const member of members.slice(0, -1)) {
        const owned = world.get(member.panels[0]?.id ?? "");
        const axis = axisOf(member, along);

        // A member already at its size is left alone: re-setting it walks
        // the gap-correction double-set once more and its integer rounding
        // can nudge a sibling off by a pixel for nothing.
        if (owned !== undefined && Math.abs(axis.size() - owned) > 0.5) {
          setRendered(axis, owned);
        }
      }
    }
  }

  function holdsStrip(split: Element): boolean {
    for (const panelId of records.keys()) {
      const group = groupOf(panelId);

      if (
        group !== undefined &&
        group.element.closest(SPLIT_SELECTOR) === split
      ) {
        return true;
      }
    }

    return false;
  }

  /** Forgets `panelId`'s strip and lifts both axes' clamps. Returns the
   * step that puts its natural size back, to run AFTER the siblings have
   * re-settled (a broken column must get its width back first, and while a
   * max constraint still pins the bar a `setSize` would be clamped straight
   * back). Null when this engine never stripped it. */
  function releaseStrip(panelId: string): (() => void) | null {
    const record = records.get(panelId);
    const group = groupOf(panelId);

    if (record === undefined || group === undefined) {
      return null;
    }

    records.delete(panelId);
    const naturalAxis = axisOf(group, record.natural);
    naturalAxis.constrain(record.minimum, record.maximum);
    axisOf(group, opposite(record.natural)).constrain(
      record.orthogonalMinimum,
      record.orthogonalMaximum,
    );

    return () => {
      setRendered(naturalAxis, record.size);
    };
  }

  /** Lifts the current maximize: releases every strip it made (not the
   * user's) and returns their size-restore steps; nothing when none. */
  function releaseMaximize(): readonly (() => void)[] {
    if (maximized === null) {
      return [];
    }

    const restores: (() => void)[] = [];

    for (const panelId of maximized.stripped) {
      const restore = releaseStrip(panelId);

      if (restore !== null) {
        restores.push(restore);
      }
    }

    maximized = null;

    return restores;
  }

  /** Re-derives every strip's orientation and geometry from the current
   * collapse set and pushes the orientations to the client when they moved.
   * Runs whole, not incrementally: the panel that just collapsed or expanded
   * can flip its SIBLINGS' orientation (the last strip completing a column,
   * the first expand breaking it), so every strip is re-settled together. */
  function settleStrips(): void {
    const stripped = new Map<Element, string>();

    for (const panelId of records.keys()) {
      const group = groupOf(panelId);

      if (group !== undefined) {
        stripped.set(group.element, panelId);
      }
    }

    function isStripped(element: Element): boolean {
      return stripped.has(element);
    }

    const strips: Record<string, DockStripOrientation> = {};
    const nowFlipped = new Set<Element>();

    // Pass 1 — orientations, and the splits that are flipped right now.
    for (const [element, panelId] of stripped) {
      const reclaim = reclaimSplitOf(element, isStripped);
      strips[panelId] = orientationAgainst(reclaim.split);

      for (const flipped of reclaim.flipped) {
        nowFlipped.add(flipped);
      }
    }

    // Pass 2 — a split flipping NOW remembers its size on the parent's axis
    // before the clamps below pin it to the strip.
    for (const split of nowFlipped) {
      if (!flippedSplits.has(split)) {
        const witness = firstStrippedGroupIn(split, stripped, groupOf);

        if (witness !== undefined) {
          // Same reload rule as recordStrip: a re-collapse after a blob
          // restore would measure the bar the blob stored, so a sidecar-
          // persisted pre-flip size wins over the live witness.
          const key = flipKeyOf(split, stripped);
          const seededSize = seededFlipSizes.get(key);
          seededFlipSizes.delete(key);

          // The split's size on its PARENT's axis — a column's width — is
          // the axis orthogonal to the one its own children run along.
          flippedSplits.set(
            split,
            seededSize ??
              axisOf(witness, opposite(orientationAgainst(split))).size(),
          );
        }
      }
    }

    // Pass 3 — every strip's geometry: clamp the reclaim axis to the bar,
    // release the other. Constraints before sizes throughout (a bare setSize
    // leaves the group draggable back open and lets a sibling's resize push
    // it wide again).
    for (const panelId of stripped.values()) {
      const record = records.get(panelId);
      const group = groupOf(panelId);
      const orientation = strips[panelId];

      if (
        record === undefined ||
        group === undefined ||
        orientation === undefined
      ) {
        continue;
      }

      const naturalAxis = axisOf(group, record.natural);
      const orthogonalAxis = axisOf(group, opposite(record.natural));

      if (orientation === record.natural) {
        orthogonalAxis.constrain(
          record.orthogonalMinimum,
          record.orthogonalMaximum,
        );
        clampRendered(naturalAxis, barSizeFor(orientation));
      } else {
        naturalAxis.constrain(record.minimum, record.maximum);
        clampRendered(orthogonalAxis, barSizeFor(orientation));
      }
    }

    // Pass 4 — a split that is no longer flipped gets its remembered size
    // back, now that its strips' orthogonal clamps are released.
    for (const [split, size] of flippedSplits) {
      if (nowFlipped.has(split)) {
        continue;
      }

      flippedSplits.delete(split);
      const witness = firstGroupIn(split, api.groups);

      if (witness !== undefined) {
        setRendered(axisOf(witness, opposite(orientationAgainst(split))), size);
      }
    }

    // Pass 5 — the strips of a flipped split share its length equally, as
    // the in-house strip cells do (`.cell[data-strip-fill]`, flex 1 1 auto).
    for (const split of nowFlipped) {
      shareAlong(split, stripped, groupOf);
    }

    if (!sameStrips(lastStrips, strips)) {
      lastStrips = strips;
      opts.onStripsChange?.(strips);
    }
  }

  // ——— Design-width pins (the in-house `fixedPx`/`initialPx` semantics) ———
  // In-house renders a design-width cell at `flex: 0 0 <px>`: it HOLDS its
  // pixels through every viewport resize while the fraction siblings absorb
  // the delta, until the first drag of its own split's handle converts the
  // split to plain fractions for good. Dockview instead rescales every child
  // proportionally on a container resize, so the seed's exact allocation
  // drifts on the first window resize. Each pin is held the way the strip
  // machinery holds a bar — min=max constraints, which dockview's splitview
  // honours live on every resize distribution — and released on the first
  // pointer MOVE of a sash drag inside the declaring split (a grab that
  // never moves keeps the pin, as in-house does).
  let designPins: DesignPinRecord[] = [];
  let pendingSashSplit: Element | null = null;

  function applyDesignPins(pins: readonly DockDesignPin[]): void {
    for (const pin of pins) {
      if (!panelsExactlyFill(pin.panelIds, groupOf)) {
        continue;
      }

      const orientation = pinOrientationOf(pin);
      const first = groupOf(pin.panelIds[0] ?? "");

      if (first === undefined) {
        continue;
      }

      const ownerSplit = declaringSplitOf(first.element, pin.axis);

      if (ownerSplit === null) {
        continue;
      }

      const members: PinMember[] = [];
      const clamped = new Set<Element>();

      for (const panelId of pin.panelIds) {
        const group = groupOf(panelId);

        if (group === undefined) {
          continue;
        }

        const axis = axisOf(group, orientation);
        members.push({
          panelId,
          previousMinimum: axis.minimum(),
          previousMaximum: axis.maximum(),
        });

        // A rail split's panels share one extent on the pin axis — clamp
        // each GROUP once (the branch's constraint is the meet of its
        // children's), not once per panel.
        if (!clamped.has(group.element)) {
          clamped.add(group.element);
          clampRendered(axis, pin.px);
        }
      }

      designPins.push({ pin, members, ownerSplit });
    }
  }

  /** Lifts every design pin whose declaring split owns `sashSplit`'s sash —
   * the user is taking over that split, exactly as an in-house drag converts
   * its split to fractions. A pinned panel that is currently a STRIP has its
   * strip record patched instead (the pin lives on in the record's captured
   * constraints, which settleStrips and expand would otherwise re-assert). */
  function unpinSplit(sashSplit: Element): void {
    const kept: DesignPinRecord[] = [];
    let patchedStrips = false;

    for (const record of designPins) {
      if (record.ownerSplit !== sashSplit) {
        kept.push(record);
        continue;
      }

      const orientation = pinOrientationOf(record.pin);
      const released = new Set<Element>();

      for (const member of record.members) {
        const strip = records.get(member.panelId);

        if (strip !== undefined) {
          if (orientation === strip.natural) {
            strip.minimum = member.previousMinimum;
            strip.maximum = member.previousMaximum;
          } else {
            strip.orthogonalMinimum = member.previousMinimum;
            strip.orthogonalMaximum = member.previousMaximum;
          }

          patchedStrips = true;
          continue;
        }

        const group = groupOf(member.panelId);

        if (group === undefined || released.has(group.element)) {
          continue;
        }

        released.add(group.element);
        axisOf(group, orientation).constrain(
          member.previousMinimum,
          member.previousMaximum,
        );
      }
    }

    designPins = kept;

    if (patchedStrips) {
      settleStrips();
    }
  }

  /** The pins worth persisting: drops (and releases) any whose groups no
   * longer hold exactly the pinned panels — a tab dragged into or out of a
   * pinned group dissolves the pin rather than clamping a stranger. */
  function intactDesignPins(): readonly DockDesignPin[] {
    const kept: DesignPinRecord[] = [];

    for (const record of designPins) {
      if (panelsExactlyFill(record.pin.panelIds, groupOf)) {
        kept.push(record);
        continue;
      }

      const orientation = pinOrientationOf(record.pin);

      for (const member of record.members) {
        const group = groupOf(member.panelId);

        if (group !== undefined && !records.has(member.panelId)) {
          axisOf(group, orientation).constrain(
            member.previousMinimum,
            member.previousMaximum,
          );
        }
      }
    }

    designPins = kept;

    return designPins.map((record) => {
      return record.pin;
    });
  }

  function armSashUnpin(event: Event): void {
    const target = event.target;

    if (designPins.length === 0 || !(target instanceof Element)) {
      return;
    }

    const sash = target.closest(".dv-sash");
    pendingSashSplit = sash?.closest(SPLIT_SELECTOR) ?? null;

    if (pendingSashSplit !== null) {
      window.addEventListener("pointermove", unpinOnDragMove, true);
      window.addEventListener("pointerup", disarmSashUnpin, true);
    }
  }

  function unpinOnDragMove(): void {
    const split = pendingSashSplit;
    disarmSashUnpin();

    if (split !== null) {
      unpinSplit(split);
    }
  }

  function disarmSashUnpin(): void {
    pendingSashSplit = null;
    window.removeEventListener("pointermove", unpinOnDragMove, true);
    window.removeEventListener("pointerup", disarmSashUnpin, true);
  }

  applyDesignPins(restored.pins);
  opts.container.addEventListener("pointerdown", armSashUnpin, true);

  return {
    maximizePanel: (panelId: string): void => {
      const panel = api.getPanel(panelId);

      if (panel === undefined || maximized?.panelId === panelId) {
        return;
      }

      glide(() => {
        // Switching from another maximized panel: put ITS strips back fully
        // first, so the sizes recorded below are real ones, not the bars.
        const restores = releaseMaximize();

        if (restores.length > 0) {
          settleStrips();

          for (const restore of restores) {
            restore();
          }

          // Worlds settled BEFORE the new boundary strips below record their
          // sizes — the switch must not remember a mid-redistribution state.
          settleStripFreeWorlds();
        }

        const boundary = maximizeBoundaryOf(
          panel.group.element,
          opts.panels.maximizeScope?.(panelId) ?? "root",
          opts.container,
        );
        const stripped: string[] = [];

        // Snapshots: ejecting a tab sibling into its own group mutates both
        // lists mid-walk. The maximized panel's own group is skipped whole —
        // its tab siblings stay tabs behind it, as they were.
        for (const group of [...api.groups]) {
          if (group === panel.group || !boundary.contains(group.element)) {
            continue;
          }

          for (const sibling of [...group.panels]) {
            if (recordStrip(sibling.id)) {
              stripped.push(sibling.id);
            }
          }
        }

        maximized = { panelId, stripped };
        settleStrips();
      });
    },
    exitMaximize: (): void => {
      if (maximized === null) {
        return;
      }

      glide(() => {
        const restores = releaseMaximize();
        // Siblings first (a broken column restores its width), then each
        // panel's own length on its natural axis.
        settleStrips();

        for (const restore of restores) {
          restore();
        }

        settleStripFreeWorlds();
      });
    },
    collapsePanel: (panelId: string): void => {
      // Collapsing a panel the maximize already stripped changes nothing on
      // screen, but hands the strip to the user: it now outlives the
      // maximize, as a panel in the in-house `collapsed` set does.
      if (maximized?.stripped.includes(panelId) === true) {
        maximized = {
          panelId: maximized.panelId,
          stripped: maximized.stripped.filter((id) => {
            return id !== panelId;
          }),
        };

        return;
      }

      if (recordStrip(panelId)) {
        glide(settleStrips);
      }
    },
    expandPanel: (panelId: string): void => {
      const restore = releaseStrip(panelId);

      if (restore === null) {
        return;
      }

      glide(() => {
        settleStrips();
        restore();
        settleStripFreeWorlds();
      });
    },
    groupCount: () => {
      return api.groups.length;
    },
    dispose: () => {
      changeSub.dispose();
      opts.container.removeEventListener("pointerdown", armSashUnpin, true);
      disarmSashUnpin();

      if (glideTimer !== null) {
        clearTimeout(glideTimer);
        glideTimer = null;
        opts.container.removeAttribute(DOCK_GLIDE_ATTRIBUTE);
      }

      // The last layout mutation must survive dispose. Dockview's model
      // updates synchronously (only its onDidLayoutChange notification is
      // microtask-deferred, via AsapEvent), so a mutation right before
      // dispose — e.g. maximize just ahead of navigating away — would
      // otherwise be lost: cancel any pending debounce and flush one final
      // serialisation unconditionally rather than only when a timer happens
      // to already be pending.
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }

      serializeLayout();
      api.dispose();
    },
  };
}

/** dockview's public `DockviewGroupPanel` narrowed to what the collapse /
 * expand code touches, so the helpers below stay honest about it. */
interface SizableGroup {
  readonly element: HTMLElement;
  readonly minimumWidth: number;
  readonly maximumWidth: number;
  readonly minimumHeight: number;
  readonly maximumHeight: number;
  readonly panels: readonly SizablePanel[];
  readonly api: SizableGroupApi;
}

interface SizablePanel {
  readonly id: string;
}

/** One member of a design pin: the panel, and the constraints its group had
 * before the pin clamped it — what a release puts back. */
interface PinMember {
  readonly panelId: string;
  readonly previousMinimum: number;
  readonly previousMaximum: number;
}

/** A live design pin: the persisted description, its members' pre-pin
 * constraints, and the split whose sash releases it. */
interface DesignPinRecord {
  readonly pin: DockDesignPin;
  readonly members: readonly PinMember[];
  readonly ownerSplit: Element;
}

/** The axisOf key for a pin's dimension: axisOf names axes by STRIP
 * orientation, where a "vertical" strip is a narrow column — the WIDTH axis. */
function pinOrientationOf(pin: DockDesignPin): DockStripOrientation {
  return pin.axis === "width" ? "vertical" : "horizontal";
}

/** True when the pinned panels' groups hold exactly those panels — no group
 * missing, no stranger tab that a pin's clamp would wrongly hold too. */
function panelsExactlyFill(
  panelIds: readonly string[],
  groupOf: (panelId: string) => SizableGroup | undefined,
): boolean {
  const groups = new Set<SizableGroup>();

  for (const panelId of panelIds) {
    const group = groupOf(panelId);

    if (group === undefined) {
      return false;
    }

    groups.add(group);
  }

  const held = new Set<string>();

  for (const group of groups) {
    for (const panel of group.panels) {
      held.add(panel.id);
    }
  }

  return (
    held.size === panelIds.length &&
    panelIds.every((panelId) => {
      return held.has(panelId);
    })
  );
}

/** The split that DECLARED a pin on `axis`, walking up from the pinned
 * child's DOM: a row divides width (`dv-horizontal`), a column height. For a
 * panel child that is the nearest enclosing split of the right orientation;
 * for a rail-split child the walk steps over the rail's own container. */
function declaringSplitOf(
  element: Element,
  axis: DockDesignPin["axis"],
): Element | null {
  const wanted = axis === "width" ? "dv-horizontal" : "dv-vertical";
  let split: Element | null = element.closest(SPLIT_SELECTOR);

  while (split !== null && !split.classList.contains(wanted)) {
    split = split.parentElement?.closest(SPLIT_SELECTOR) ?? null;
  }

  return split;
}

interface SizableGroupApi {
  readonly width: number;
  readonly height: number;
  setSize(event: GroupSizeEvent): void;
  setConstraints(constraints: GroupConstraints): void;
}

interface GroupSizeEvent {
  width?: number;
  height?: number;
}

interface GroupConstraints {
  minimumWidth?: number;
  maximumWidth?: number;
  minimumHeight?: number;
  maximumHeight?: number;
}

/** One sizing axis of a group — width or height — behind a uniform surface,
 * so the strip clamp and its restore are written once for both. */
interface GroupAxis {
  size(): number;
  minimum(): number;
  maximum(): number;
  constrain(minimum: number, maximum: number): void;
  set(size: number): void;
}

/**
 * The strip a group collapses to depends on the axis its siblings run
 * along, which is the orientation of the split view holding it: dockview
 * stamps `dv-horizontal` / `dv-vertical` on that container (its own class
 * names, stable across 7.x). Side-by-side siblings reclaim WIDTH, so the
 * group becomes a narrow full-height column and its strip reads vertically;
 * stacked siblings reclaim HEIGHT, so it becomes a short full-width bar. A
 * lone root group (no split view) has nothing to reclaim along and gets the
 * vertical treatment, as the in-house engine's root leaf does.
 */
function stripOrientationOf(group: SizableGroup): DockStripOrientation {
  const splitView = group.element.closest(SPLIT_SELECTOR);

  return splitView === null ? "vertical" : orientationAgainst(splitView);
}

const SPLIT_SELECTOR = ".dv-split-view-container";
const GROUP_SELECTOR = ".dv-groupview";

/** Which way a strip reads when its space reclaims along `split`'s axis:
 * siblings side by side (a horizontal split) → a 32px vertical column;
 * siblings stacked (a vertical split) → a 32px horizontal bar. */
function orientationAgainst(split: Element): DockStripOrientation {
  return split.classList.contains("dv-vertical") ? "horizontal" : "vertical";
}

function opposite(orientation: DockStripOrientation): DockStripOrientation {
  return orientation === "vertical" ? "horizontal" : "vertical";
}

function barSizeFor(orientation: DockStripOrientation): number {
  return orientation === "vertical" ? STRIP_WIDTH_PX : STRIP_HEIGHT_PX;
}

/** The element whose groups a maximize strips — the in-house
 * `maximizeBoundaryPath`: the whole dock for `"root"`; for
 * `"nearest-column"` the nearest enclosing COLUMN split (children stacked
 * — the seed's `dir: "column"`, which dockview marks `dv-vertical`),
 * falling back to the whole dock when the group has no column ancestor. */
function maximizeBoundaryOf(
  groupElement: Element,
  scope: DockMaximizeScope,
  dock: Element,
): Element {
  if (scope === "root") {
    return dock;
  }

  let split: Element | null = groupElement.closest(SPLIT_SELECTOR);

  while (split !== null) {
    if (split.classList.contains("dv-vertical")) {
      return split;
    }

    split = split.parentElement?.closest(SPLIT_SELECTOR) ?? null;
  }

  return dock;
}

/** The in-house `stripDir` walk: a group's space reclaims along the nearest
 * enclosing split that is NOT fully stripped. Every split passed on the way
 * up (each with all its groups stripped) is "flipped" — its strips read
 * against the parent's axis and it hugs the bar on that axis. */
interface ReclaimSplit {
  /** The split whose axis the group's space reclaims along. */
  split: Element;
  /** Every fully-stripped split passed on the way up to it. */
  flipped: readonly Element[];
}

function reclaimSplitOf(
  groupElement: Element,
  isStripped: (element: Element) => boolean,
): ReclaimSplit {
  const flipped: Element[] = [];
  const own = groupElement.closest(SPLIT_SELECTOR);

  if (own === null) {
    throw new Error("dockview group outside any split view");
  }

  let split: Element = own;

  while (allGroupsStripped(split, isStripped)) {
    const parent: Element | null =
      split.parentElement?.closest(SPLIT_SELECTOR) ?? null;

    if (parent === null) {
      break;
    }

    flipped.push(split);
    split = parent;
  }

  return { split, flipped };
}

function allGroupsStripped(
  split: Element,
  isStripped: (element: Element) => boolean,
): boolean {
  const groups = split.querySelectorAll(GROUP_SELECTOR);

  return groups.length > 0 && [...groups].every(isStripped);
}

/** The lookup key a flipped split's persisted pre-flip size is filed under:
 * the sorted ids of the stripped panels inside it — the only identity a
 * split has that survives serialisation (its Element does not). Must match
 * {@link flipKeyFor} over the persisted entry's panelIds. */
function flipKeyOf(
  split: Element,
  stripped: ReadonlyMap<Element, string>,
): string {
  const panelIds: string[] = [];

  for (const element of split.querySelectorAll(GROUP_SELECTOR)) {
    const panelId = stripped.get(element);

    if (panelId !== undefined) {
      panelIds.push(panelId);
    }
  }

  return flipKeyFor(panelIds);
}

function flipKeyFor(panelIds: readonly string[]): string {
  return JSON.stringify([...panelIds].sort());
}

function firstStrippedGroupIn(
  split: Element,
  stripped: ReadonlyMap<Element, string>,
  groupOf: (panelId: string) => SizableGroup | undefined,
): SizableGroup | undefined {
  for (const element of split.querySelectorAll(GROUP_SELECTOR)) {
    const panelId = stripped.get(element);

    if (panelId !== undefined) {
      return groupOf(panelId);
    }
  }

  return undefined;
}

function firstGroupIn(
  split: Element,
  groups: readonly SizableGroup[],
): SizableGroup | undefined {
  return groups.find((group) => {
    return split.contains(group.element);
  });
}

/** Gives a flipped split's strips an equal share of its length — measured as
 * what they render at now (the gap between them is dockview's own, so the
 * shares sum back to the split), settled one by one through setRendered. */
function shareAlong(
  split: Element,
  stripped: ReadonlyMap<Element, string>,
  groupOf: (panelId: string) => SizableGroup | undefined,
): void {
  // `orientationAgainst(split)` names the strip a child of THIS split makes
  // — a horizontal bar in a column — and axisOf keys on that same name, so
  // it is also the axis running down the split's length.
  const along = orientationAgainst(split);
  const members: SizableGroup[] = [];

  for (const element of split.querySelectorAll(GROUP_SELECTOR)) {
    const panelId = stripped.get(element);
    const group = panelId === undefined ? undefined : groupOf(panelId);

    if (group !== undefined) {
      members.push(group);
    }
  }

  if (members.length < 2) {
    return;
  }

  const total = members.reduce((sum, group) => {
    return sum + axisOf(group, along).size();
  }, 0);
  const share = Math.floor(total / members.length);

  for (const group of members) {
    setRendered(axisOf(group, along), share);
  }
}

function sameStrips(a: DockStripMap, b: DockStripMap): boolean {
  const keys = Object.keys(a);

  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => {
      return a[key] === b[key];
    })
  );
}

function axisOf(
  group: SizableGroup,
  orientation: DockStripOrientation,
): GroupAxis {
  if (orientation === "vertical") {
    return {
      size: (): number => {
        return group.api.width;
      },
      minimum: (): number => {
        return group.minimumWidth;
      },
      maximum: (): number => {
        return group.maximumWidth;
      },
      constrain: (minimum: number, maximum: number): void => {
        group.api.setConstraints({
          minimumWidth: minimum,
          maximumWidth: maximum,
        });
      },
      set: (size: number): void => {
        group.api.setSize({ width: size });
      },
    };
  }

  return {
    size: (): number => {
      return group.api.height;
    },
    minimum: (): number => {
      return group.minimumHeight;
    },
    maximum: (): number => {
      return group.maximumHeight;
    },
    constrain: (minimum: number, maximum: number): void => {
      group.api.setConstraints({
        minimumHeight: minimum,
        maximumHeight: maximum,
      });
    },
    set: (size: number): void => {
      group.api.setSize({ height: size });
    },
  };
}

/**
 * Sizes a group so that it RENDERS at `size` along `axis`, not merely models
 * it. With a theme `gap`, dockview keeps a split's model sizes summing to the
 * full extent but shaves `gap × (n − 1) / n` off every child when laying it
 * out — so `setSize({ width: 32 })` lands on screen (and in `group.api.width`)
 * at 32 minus that share. The share depends on the sibling count of a branch
 * the public API does not expose, so rather than recompute it this measures
 * it: apply the size once, read back what rendered, and re-apply with the
 * difference folded in. Idempotent when there is no gap (the difference is
 * zero and the second pass is skipped).
 */
function setRendered(axis: GroupAxis, size: number): void {
  axis.set(size);
  const shortfall = size - axis.size();

  // Only a POSITIVE shortfall is the gap shave. A negative one means the
  // splitview rendered the group BIGGER than asked because its siblings'
  // constraints left no other feasible layout (an expand whose siblings are
  // still clamped bars fills the split regardless of its recorded size) — a
  // "correction" would push a bogus, possibly negative size into the model.
  if (shortfall > 0) {
    axis.set(size + shortfall);
  }
}

/** Pins a group to render at exactly `size` along `axis`: constraints and
 * size together, with the same gap-share correction as {@link setRendered}
 * applied to both (a max constraint at the bare target would cap the
 * corrected size straight back to the shortfall). */
function clampRendered(axis: GroupAxis, size: number): void {
  axis.constrain(size, size);
  axis.set(size);
  const shortfall = size - axis.size();

  if (shortfall !== 0) {
    const corrected = size + shortfall;
    axis.constrain(corrected, corrected);
    axis.set(corrected);
  }
}

/** What a load hands the engine beyond the grid dockview restored: the
 * design pins to apply, and the strip-geometry seeds a re-applied collapse
 * consumes (empty on a seed load or a legacy blob). */
interface RestoredLayout {
  readonly pins: readonly DockDesignPin[];
  /** Each persisted strip's pre-collapse size, by panel id. */
  readonly stripSizes: ReadonlyMap<string, number>;
  /** Each persisted flipped split's pre-flip size, by {@link flipKeyFor}. */
  readonly flipSizes: ReadonlyMap<string, number>;
}

/** Restores the persisted blob, falling back to the seed tree on ANY failure —
 * a stale or corrupt blob must never brick the workspace. Returns the design
 * pins to apply — the blob's own surviving `rtcDesignPins` (a legacy blob
 * without the field gets none — that layout may be user-shaped already), or
 * the freshly converted seed's — plus the blob's strip-geometry seeds. */
function loadBlobOrSeed(
  api: DockviewApi,
  opts: DockEngineOptions,
  width: number,
  height: number,
): RestoredLayout {
  if (opts.blob !== null) {
    try {
      const parsed: unknown = JSON.parse(opts.blob);
      // dockview's fromJSON reads only the fields it knows, so the pin and
      // strip-geometry sidecars ride through untouched.
      api.fromJSON(parsed as Parameters<DockviewApi["fromJSON"]>[0]);

      return { pins: designPinsIn(parsed), ...stripGeometryIn(parsed) };
    } catch {
      // fall through to the seed
    }
  }

  const { serialized, pins } = convertSeed(opts.seed, width, height, {
    gap: GROUP_GAP_PX,
  });
  api.fromJSON(serialized);

  return { pins, stripSizes: new Map(), flipSizes: new Map() };
}

/** A blob that MAY carry the pin sidecar — what a save wrote, unverified. */
interface PinSidecarCarrier {
  readonly rtcDesignPins?: unknown;
}

/** One unverified sidecar entry, field by field. */
interface UnverifiedPin {
  readonly panelIds?: unknown;
  readonly px?: unknown;
  readonly axis?: unknown;
}

/** The `rtcDesignPins` sidecar of a parsed blob, dropping anything malformed
 * — the blob crosses localStorage, so its shape is unverified input. */
function designPinsIn(parsed: unknown): readonly DockDesignPin[] {
  if (typeof parsed !== "object" || parsed === null) {
    return [];
  }

  const raw = (parsed as PinSidecarCarrier).rtcDesignPins;

  if (!Array.isArray(raw)) {
    return [];
  }

  const pins: DockDesignPin[] = [];

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const { panelIds, px, axis } = entry as UnverifiedPin;
    const ids = Array.isArray(panelIds)
      ? panelIds.filter((id): id is string => {
          return typeof id === "string";
        })
      : [];

    if (
      ids.length === 0 ||
      !Array.isArray(panelIds) ||
      ids.length !== panelIds.length ||
      typeof px !== "number" ||
      !Number.isFinite(px) ||
      px <= 0 ||
      (axis !== "width" && axis !== "height")
    ) {
      continue;
    }

    pins.push({ panelIds: ids, px, axis });
  }

  return pins;
}

/** One strip's persisted restore geometry: only its pre-collapse size on its
 * natural axis. Constraints are deliberately NOT persisted — the reload
 * re-derives them live (dockview defaults, or a freshly re-applied pin's
 * clamp), so a stale saved constraint can never resurrect. */
interface PersistedStripSize {
  readonly size: number;
}

/** A flipped split's persisted pre-flip size, addressed by the panels
 * stripped inside it — see {@link flipKeyOf}. */
interface PersistedFlip {
  readonly panelIds: readonly string[];
  readonly size: number;
}

/** The `rtcStripGeometry` sidecar a save writes while strips exist. */
interface StripGeometrySidecar {
  readonly records: Readonly<Record<string, PersistedStripSize>>;
  readonly flips: readonly PersistedFlip[];
}

/** A blob that MAY carry the strip-geometry sidecar, unverified. */
interface StripSidecarCarrier {
  readonly rtcStripGeometry?: unknown;
}

/** The sidecar's two collections, field by field, unverified. */
interface UnverifiedStripGeometry {
  readonly records?: unknown;
  readonly flips?: unknown;
}

/** One unverified per-strip entry of the sidecar. */
interface UnverifiedStripSize {
  readonly size?: unknown;
}

/** One unverified flip entry of the sidecar. */
interface UnverifiedFlip {
  readonly panelIds?: unknown;
  readonly size?: unknown;
}

/** The `rtcStripGeometry` sidecar of a parsed blob as seed maps, dropping
 * anything malformed — like the pins, it crosses localStorage. */
function stripGeometryIn(
  parsed: unknown,
): Pick<RestoredLayout, "stripSizes" | "flipSizes"> {
  const stripSizes = new Map<string, number>();
  const flipSizes = new Map<string, number>();
  const seeds = { stripSizes, flipSizes };

  if (typeof parsed !== "object" || parsed === null) {
    return seeds;
  }

  const raw = (parsed as StripSidecarCarrier).rtcStripGeometry;

  if (typeof raw !== "object" || raw === null) {
    return seeds;
  }

  const { records, flips } = raw as UnverifiedStripGeometry;

  if (typeof records === "object" && records !== null) {
    for (const [panelId, entry] of Object.entries(records)) {
      const size = (entry as UnverifiedStripSize | null)?.size;

      if (isUsableSize(size)) {
        stripSizes.set(panelId, size);
      }
    }
  }

  if (Array.isArray(flips)) {
    for (const entry of flips) {
      if (typeof entry !== "object" || entry === null) {
        continue;
      }

      const { panelIds, size } = entry as UnverifiedFlip;
      const ids = Array.isArray(panelIds)
        ? panelIds.filter((id): id is string => {
            return typeof id === "string";
          })
        : [];

      if (
        Array.isArray(panelIds) &&
        ids.length === panelIds.length &&
        ids.length > 0 &&
        isUsableSize(size)
      ) {
        flipSizes.set(flipKeyFor(ids), size);
      }
    }
  }

  return seeds;
}

function isUsableSize(size: unknown): size is number {
  return typeof size === "number" && Number.isFinite(size) && size > 0;
}

/** `createRightHeaderActionComponent` only when the client supplied a
 * `mountActions` hook — dockview renders no actions slot at all otherwise,
 * rather than an empty one. Read once, here, so the renderer never has to
 * re-check optionality per group. */
function actionsFactory(
  hooks: DockPanelHooks,
): (() => HookActionsRenderer) | undefined {
  const mountActions = hooks.mountActions;

  if (mountActions === undefined) {
    return undefined;
  }

  return (): HookActionsRenderer => {
    return new HookActionsRenderer(mountActions);
  };
}

function applyTitles(api: DockviewApi, hooks: DockPanelHooks): void {
  for (const panel of api.panels) {
    panel.setTitle(hooks.title(panel.id));
  }
}
