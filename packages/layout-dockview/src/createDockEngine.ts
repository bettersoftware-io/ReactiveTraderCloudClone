import { createDockview, type DockviewApi, type DockviewTheme } from "dockview";

import { type DockSeedNode, toSerializedDockview } from "#/dockSeed";
import { HookContentRenderer } from "#/HookContentRenderer";
import { TitleOnlyTab } from "#/TitleOnlyTab";

const RTC_TAB_COMPONENT = "rtc-tab";

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
};

export interface DockPanelHooks {
  title(panelId: string): string;
  /** Mount framework-native content into the element Dockview owns; returns the disposer. */
  mount(panelId: string, element: HTMLElement): () => void;
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

/** Width a collapsed group is clamped to, matching the in-house engine's
 * vertical `.collapsedStrip` (38px outer, 1px borders inside) so the two
 * engines strip a panel to the same bar. The in-house engine also has a 32px
 * horizontal variant; dockview collapse clamps WIDTH only, which is the
 * vertical case, so the one constant covers it. */
const STRIP_PX = 38;

export interface DockEngine {
  maximizePanel(panelId: string): void;
  exitMaximize(): void;
  /** Strip this panel to a {@link STRIP_PX} bar. Idempotent. */
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
interface PreCollapseGeometry {
  width: number;
  minimumWidth: number;
  maximumWidth: number;
}

export function createDockEngine(opts: DockEngineOptions): DockEngine {
  const api: DockviewApi = createDockview(opts.container, {
    createComponent: () => {
      return new HookContentRenderer(opts.panels);
    },
    // Panel close/reopen is out of v1 scope — see TitleOnlyTab's own doc
    // comment for why this replaces the default tab renderer entirely
    // instead of hiding the close button with CSS. `defaultTabComponent`
    // must ALSO be set: without a `tabComponent` id on the panel (which
    // `fromJSON`-restored panels never carry), dockview falls back to its
    // own built-in `DefaultTab` — WITH the close action — and never calls
    // `createTabComponent` at all.
    defaultTabComponent: RTC_TAB_COMPONENT,
    createTabComponent: () => {
      return new TitleOnlyTab();
    },
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
    opts.onLayoutChange(JSON.stringify(api.toJSON()));
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
    collapsePanel: (panelId: string) => {
      const panel = api.getPanel(panelId);

      if (panel === undefined || preCollapse.has(panelId)) {
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

      preCollapse.set(panelId, {
        width: group.api.width,
        minimumWidth: group.minimumWidth,
        maximumWidth: group.maximumWidth,
      });

      // Constraints BEFORE size: a bare `setSize` leaves the group draggable
      // back open and lets a sibling's resize push it wide again, so the strip
      // would not survive the next layout pass.
      group.api.setConstraints({
        minimumWidth: STRIP_PX,
        maximumWidth: STRIP_PX,
      });
      group.api.setSize({ width: STRIP_PX });
    },
    expandPanel: (panelId: string) => {
      const prior = preCollapse.get(panelId);
      const panel = api.getPanel(panelId);

      if (prior === undefined || panel === undefined) {
        return;
      }

      const group = panel.group;

      // Constraints first again — while max is still pinned at STRIP_PX,
      // `setSize` to anything wider would be clamped straight back.
      group.api.setConstraints({
        minimumWidth: prior.minimumWidth,
        maximumWidth: prior.maximumWidth,
      });
      group.api.setSize({ width: prior.width });
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

  api.fromJSON(toSerializedDockview(opts.seed, width, height));
}

function applyTitles(api: DockviewApi, hooks: DockPanelHooks): void {
  for (const panel of api.panels) {
    panel.setTitle(hooks.title(panel.id));
  }
}
