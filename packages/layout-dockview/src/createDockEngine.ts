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
  /** Debounce for onLayoutChange serialisation; default 250. Tests pass 0. */
  debounceMs?: number;
}

/** The bar a collapsed group is clamped to, matching the in-house engine's
 * strips so the two engines strip a panel to the same bar: a group whose
 * siblings run side by side (a horizontal split) shrinks to a 38px-wide
 * full-height column — the in-house `.collapsedStrip`, 38px outer with 1px
 * borders inside — and one whose siblings stack (a vertical split) shrinks
 * to a 32px-tall full-width bar, the in-house `.panel[data-strip]`. */
const STRIP_WIDTH_PX = 38;
const STRIP_HEIGHT_PX = 32;

/** Which way a collapsed panel's strip reads: `"vertical"` for the 38px
 * column (its label runs bottom-to-top), `"horizontal"` for the 32px bar —
 * the in-house engine's `data-strip-orientation`, decided here from the
 * axis the panel's group reclaims along. */
export type DockStripOrientation = "vertical" | "horizontal";

export interface DockEngine {
  maximizePanel(panelId: string): void;
  exitMaximize(): void;
  /** Strip this panel to a bar along the axis its group's siblings run on
   * (see {@link STRIP_WIDTH_PX}), returning which way the strip reads so the
   * client can render the matching restore bar. Idempotent: a second call
   * for an already-stripped panel returns its existing orientation. `null`
   * for an unknown panel. */
  collapsePanel(panelId: string): DockStripOrientation | null;
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
interface PreCollapseGeometry {
  orientation: DockStripOrientation;
  size: number;
  minimum: number;
  maximum: number;
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
  // group's width, which is exactly how dockview's own edge groups do it
  // (their `restoreExpandedSize` remembers the pre-collapse size the same way
  // this map does).
  const preCollapse = new Map<string, PreCollapseGeometry>();

  return {
    maximizePanel: (panelId: string) => {
      api.getPanel(panelId)?.api.maximize();
    },
    exitMaximize: () => {
      if (api.hasMaximizedGroup()) {
        api.exitMaximizedGroup();
      }
    },
    collapsePanel: (panelId: string): DockStripOrientation | null => {
      const panel = api.getPanel(panelId);

      if (panel === undefined) {
        return null;
      }

      const already = preCollapse.get(panelId);

      if (already !== undefined) {
        return already.orientation;
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
      const orientation = stripOrientationOf(group);
      const axis = axisOf(group, orientation);

      preCollapse.set(panelId, {
        orientation,
        size: axis.size(),
        minimum: axis.minimum(),
        maximum: axis.maximum(),
      });

      // Constraints BEFORE size: a bare `setSize` leaves the group draggable
      // back open and lets a sibling's resize push it wide again, so the strip
      // would not survive the next layout pass.
      clampRendered(
        axis,
        orientation === "vertical" ? STRIP_WIDTH_PX : STRIP_HEIGHT_PX,
      );
      return orientation;
    },
    expandPanel: (panelId: string) => {
      const prior = preCollapse.get(panelId);
      const panel = api.getPanel(panelId);

      if (prior === undefined || panel === undefined) {
        return;
      }

      const axis = axisOf(panel.group, prior.orientation);

      // Constraints first again — while max is still pinned at the strip,
      // `setSize` to anything wider would be clamped straight back.
      axis.constrain(prior.minimum, prior.maximum);
      setRendered(axis, prior.size);
      preCollapse.delete(panelId);
    },
    groupCount: () => {
      return api.groups.length;
    },
    dispose: () => {
      changeSub.dispose();

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
  const splitView = group.element.closest(".dv-split-view-container");

  return splitView?.classList.contains("dv-vertical") === true
    ? "horizontal"
    : "vertical";
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
