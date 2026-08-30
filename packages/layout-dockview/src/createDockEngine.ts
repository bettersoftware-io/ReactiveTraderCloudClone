import { createDockview, type DockviewApi, type DockviewTheme } from "dockview";

import { compensateGap } from "#/dockBlob";
import { type DockSeedNode, toSerializedDockview } from "#/dockSeed";
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
}

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
 * siblings run side by side (a horizontal split) shrinks to a 38px-wide
 * full-height column — the in-house `.collapsedStrip`, 38px outer with 1px
 * borders inside — and one whose siblings stack (a vertical split) shrinks
 * to a 32px-tall full-width bar, the in-house `.panel[data-strip]`. */
/** Set on the consumer's container for the life of an intent's glide; the
 *  stylesheet's `[data-dock-glide]` rules transition dockview's inline
 *  geometry while it is present. */
export const DOCK_GLIDE_ATTRIBUTE = "data-dock-glide";
/** The in-house glide is 0.34s (InhouseLayoutEngine.module.css `.cell` /
 *  `.panel`, PROTO's panTrans); the attribute outlives it by a frame or two
 *  so the tail of the transition is never cut off — dropping the transition
 *  property mid-flight snaps to the end value. */
export const GLIDE_ATTRIBUTE_MS = 400;
const STRIP_WIDTH_PX = 38;
const STRIP_HEIGHT_PX = 32;

/** Which way a collapsed panel's strip reads: `"vertical"` for the 38px
 * column (its label runs bottom-to-top), `"horizontal"` for the 32px bar —
 * the in-house engine's `data-strip-orientation`, decided here from the
 * axis the panel's group reclaims along. */
export type DockStripOrientation = "vertical" | "horizontal";

/** Every currently collapsed panel and which way its strip reads. */
export type DockStripMap = Readonly<Record<string, DockStripOrientation>>;

export interface DockEngine {
  maximizePanel(panelId: string): void;
  exitMaximize(): void;
  /** Strip this panel to a bar along the axis its space reclaims on (see
   * {@link STRIP_WIDTH_PX}). That axis is the in-house engine's `stripDir`:
   * the nearest enclosing split that is NOT itself fully stripped — so the
   * last panel of a rail column to collapse flips the WHOLE column to 38px
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

  loadBlobOrSeed(api, opts, width, height);
  applyTitles(api, opts.panels);

  const debounceMs = opts.debounceMs ?? 250;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function serializeLayout(): void {
    // See compensateGap: dockview serialises gap-shaved rendered sizes,
    // which would restore a little differently on every load.
    opts.onLayoutChange(
      JSON.stringify(compensateGap(api.toJSON(), GROUP_GAP_PX)),
    );
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
  // A split whose every group is a strip reclaims along its PARENT's axis
  // (the in-house `stripDir`): its own size on that axis is remembered here
  // while it is flipped, and restored the moment one of its strips expands.
  const flippedSplits = new Map<Element, number>();
  let lastStrips: DockStripMap = {};

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
          // The split's size on its PARENT's axis — a column's width — is
          // the axis orthogonal to the one its own children run along.
          flippedSplits.set(
            split,
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

  return {
    maximizePanel: (panelId: string) => {
      glide(() => {
        api.getPanel(panelId)?.api.maximize();
      });
    },
    exitMaximize: () => {
      if (api.hasMaximizedGroup()) {
        glide(() => {
          api.exitMaximizedGroup();
        });
      }
    },
    collapsePanel: (panelId: string): void => {
      const panel = api.getPanel(panelId);

      if (panel === undefined || records.has(panelId)) {
        return;
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

      records.set(panelId, {
        natural,
        size: naturalAxis.size(),
        minimum: naturalAxis.minimum(),
        maximum: naturalAxis.maximum(),
        orthogonalMinimum: orthogonalAxis.minimum(),
        orthogonalMaximum: orthogonalAxis.maximum(),
      });
      glide(settleStrips);
    },
    expandPanel: (panelId: string) => {
      const record = records.get(panelId);
      const group = groupOf(panelId);

      if (record === undefined || group === undefined) {
        return;
      }

      glide(() => {
        records.delete(panelId);
        const naturalAxis = axisOf(group, record.natural);
        // Constraints first — while max is still pinned at the strip,
        // `setSize` to anything wider would be clamped straight back.
        naturalAxis.constrain(record.minimum, record.maximum);
        axisOf(group, opposite(record.natural)).constrain(
          record.orthogonalMinimum,
          record.orthogonalMaximum,
        );
        // Siblings first (a broken column restores its width), then this
        // panel's own length on its natural axis.
        settleStrips();
        setRendered(naturalAxis, record.size);
      });
    },
    groupCount: () => {
      return api.groups.length;
    },
    dispose: () => {
      changeSub.dispose();

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
  readonly api: SizableGroupApi;
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
 * siblings side by side (a horizontal split) → a 38px vertical column;
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
 * out — so `setSize({ width: 38 })` lands on screen (and in `group.api.width`)
 * at 38 minus that share. The share depends on the sibling count of a branch
 * the public API does not expose, so rather than recompute it this measures
 * it: apply the size once, read back what rendered, and re-apply with the
 * difference folded in. Idempotent when there is no gap (the difference is
 * zero and the second pass is skipped).
 */
function setRendered(axis: GroupAxis, size: number): void {
  axis.set(size);
  const shortfall = size - axis.size();

  if (shortfall !== 0) {
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

/** Restores the persisted blob, falling back to the seed tree on ANY failure —
 * a stale or corrupt blob must never brick the workspace. */
function loadBlobOrSeed(
  api: DockviewApi,
  opts: DockEngineOptions,
  width: number,
  height: number,
): void {
  if (opts.blob !== null) {
    try {
      api.fromJSON(JSON.parse(opts.blob));
      return;
    } catch {
      // fall through to the seed
    }
  }

  api.fromJSON(
    toSerializedDockview(opts.seed, width, height, { gap: GROUP_GAP_PX }),
  );
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
