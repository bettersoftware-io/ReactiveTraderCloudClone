import {
  createDockview,
  type DockviewApi,
  type DockviewTheme,
  directionToPosition,
  type FloatingGroupOptions,
  type SerializedDockview,
} from "dockview";

import {
  DOCK_BLOB_VERSION,
  migrateDockBlob,
  withoutDynamicNodes,
  withoutFloatingGroups,
  withoutLockMarks,
  withoutPopoutGroups,
} from "#/dockBlob";
import {
  convertSeed,
  type DockDesignPin,
  type DockSeedNode,
  RTC_PANEL_COMPONENT,
  type SeedSplit,
  seedPanelIdsOf,
} from "#/dockSeed";
import { HookActionsRenderer } from "#/HookActionsRenderer";
import { HookContentRenderer } from "#/HookContentRenderer";
import { HookTabRenderer } from "#/HookTabRenderer";

const RTC_TAB_COMPONENT = "rtc-tab";

/** Gap between cards, in px — the in-house engine's 7px drag-handle track
 * (`InhouseLayoutEngine.module.css` `.handle`), so two panels sit exactly as
 * far apart under dockview as they do in-house. NOT dockview's theme `gap`:
 * that mechanism shaves `gap × (n − 1) / n` off every child at render time,
 * which made each model size fractional and each card edge a half pixel.
 * Instead the theme carries no gap and `dockview-hud.css` insets every LEAF
 * view by half of this per side — so a view's model size is its visible
 * card plus one whole gap, model equals render, and every size the engine
 * sets, reads, or serialises is the same integer. Pins and the public seed
 * still speak card px; the engine adds this constant at its edges. */
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
// No `gap` here, deliberately — see GROUP_GAP_PX: the gutter is a CSS inset
// on every leaf view, not dockview's shave-at-render margin.
const RTC_DOCKVIEW_THEME: DockviewTheme = {
  name: "rtc",
  className: "dockview-theme-rtc",
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
  /** Fired whenever the set of popped-out panels changes — after a pop-out
   * opens or a popout window closes (dock-home), with every panel id
   * currently living in a popout window. Popped state is ENGINE-OWNED
   * session state (the strips precedent): it never reaches the layout
   * machine or any persistence, so a reload restores everything docked by
   * construction. Not fired at construction (nothing popped). */
  onPopoutsChange?: (poppedPanelIds: readonly string[]) => void;
  /** Every panel currently in a FLOATING group, sorted. Fires only on change.
   * Unlike the popped set, floating IS persisted — a float is layer-3
   * arrangement, like a drag or a stack (see the Phase 6 design, §3.3). */
  readonly onFloatsChange?: (floatingPanelIds: readonly string[]) => void;
  /** The pop-out target page dockview opens in the child window (component
   * option; same-origin enforced by dockview). Defaults to dockview's own
   * `/popout.html`. The page ships empty — dockview appends its container
   * and copies the parent's stylesheets after `load`. */
  popoutUrl?: string;
  /** Debounce for onLayoutChange serialisation; default 250. Tests pass 0. */
  debounceMs?: number;
  /** The layer-2 docked set at construction (Jarvis panels the app already
   * knows should be open) — reconciled against `blob`/`seed` right after
   * restore: a listed id missing from the restored dock is added at the
   * grid's right edge (pinned at its `initialPx`, or shared by rule when
   * `unpinned` — exactly like {@link DockEngine.addDynamicPanel});
   * a restored dynamic id no longer listed is removed. Arrangement for ids
   * present in BOTH is kept verbatim — membership reconciles both ways, but
   * a panel's position/stack within the dock is never second-guessed once
   * it is there. Absent/empty → no dynamic panels at construction. */
  dynamicPanels?: readonly DockDynamicPanel[];
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

/** A panel the app opens at runtime (Jarvis docking a GenUI card, a chart
 * instance), rather than one seeded at mount. Always lands as its own new
 * group at the grid's right edge — never stacked into an existing group —
 * with `initialPx` held as a design pin exactly like a seeded rail's
 * `initialPx`, unless it is {@link DockDynamicPanel.unpinned}. */
export interface DockDynamicPanel {
  readonly id: string;
  /** Rendered card width of the new right-edge group, px. Callers pass the
   * client's DOCK_COLUMN_INITIAL_PX (360) — this package has no @rtc deps. */
  readonly initialPx: number;
  /** Registers NO design pin; the panel's split is shared by rule instead.
   * It opens at `min(initialPx, an equal share)`: its design width while the
   * split has room, else an equal share with the other unpinned panels and
   * the split's static member (the main area). Every open or close of an
   * unpinned panel re-applies that rule to its split (and a maximize or
   * strip that skipped it pays it once geometry is restored); pinned
   * children and strips are never resized. For panels that multiply (chart
   * instances — four pinned 360px columns crush the workspace); absent, the
   * panel is pinned like a seeded rail (a Jarvis dock). */
  readonly unpinned?: boolean;
}

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
  /** Opens `panel` as a new group at the grid's right edge. A pinned panel
   * opens at its `initialPx` card width and is held there exactly like a
   * seeded rail; an `unpinned` one opens at `min(initialPx, an equal share)`
   * and re-equalises its split (see {@link DockDynamicPanel.unpinned}).
   * No-op if the id already exists in the dock. */
  addDynamicPanel(panel: DockDynamicPanel): void;
  /** Closes a dynamic panel and its group, restoring whatever it stripped or
   * collapsed (maximize boundary, strip ledger) before it goes. No-op for an
   * unknown id. */
  removeDynamicPanel(panelId: string): void;
  /** Remove the panel from the grid entirely — the layer-2 `closed` set's
   * mechanism (the View menu's uncheck). Any strip record it holds is
   * released first (no orphan restore bar), closing the maximized panel
   * exits its maximize, and a maximize-forced strip drops off the record.
   * Idempotent; a no-op for an unknown panel. */
  closePanel(panelId: string): void;
  /** Re-add a previously closed panel at a deterministic seed-derived
   * position: the nearest live SEED sibling anchors it (direction from the
   * seed split's dir), walking outward through ancestor splits when the
   * whole sibling subtree is gone; an emptied grid just takes the panel as
   * its root. No-op when the panel is already open. */
  reopenPanel(panelId: string): void;
  /** Tear the panel's group out into a separate browser window. Dockview
   * owns the whole transaction (window features, stylesheet copy into the
   * child document, moving the engine-owned DOM so the client keeps
   * painting, dock-home on window close). Resolves false — grid untouched —
   * for an unknown panel or a blocked `window.open` (the only branch jsdom
   * can witness; the opened path is e2e's). Session-scoped: popped state is
   * never persisted, and the blob scrub drops any `popoutGroups` a
   * mid-popout save captured. */
  popoutPanel(panelId: string): Promise<boolean>;
  /** Floats panelId's group as a box over the grid; false when refused —
   * unknown panel, already floating, a live maximize (R3), or a collapsed
   * panel (R8) (see §3.2). */
  floatPanel(panelId: string): boolean;
  /** Returns a floating panel to its seed-home slot; no-op when not floating. */
  dockPanel(panelId: string): void;
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
    // `floatingGroupBounds` (dockview-core@8.3.1 options.d.ts:299) keeps a
    // float draggable but never lets it leave the container — "a float
    // cannot be dragged out of reach" (Phase 6 design §3.3).
    floatingGroupBounds: "boundedWithinViewport",
    // No separate drag rail above a float's head: the in-house head IS the
    // handle (see `moveFloatFromHead`), as a dialog's title bar is. "tabbar"
    // makes the group's own void container dockview's move target, which
    // `moveFloatFromHead` forwards a head press to — dockview's default
    // "titlebar" stacked a blank 22px bar on the 38px head that nobody could
    // tell was the only grip.
    floatingGroupDragHandle: "tabbar",
    // `disableFloatingGroups` deliberately left unset: shift-drag-to-float
    // and drag-to-dock (dockview's own built-in gestures) are a KEPT
    // feature, not a deviation this engine suppresses.
    // Only when the client provided one: dockview's default is already
    // /popout.html, and an explicit undefined would still override nothing,
    // but the options object stays minimal like the rest of this literal.
    ...(opts.popoutUrl === undefined ? {} : { popoutUrl: opts.popoutUrl }),
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
    // With no theme gap, dockview's toJSON IS the model — no compensation.
    // `rtcBlobVersion` marks the blob as gap-0 era; a blob without it is
    // migrated on load (migrateDockBlob).
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
    // `rtcFloatSizes` (present only while a float remembers a home size)
    // rides the same way: a float persists, so the extent its dock-home
    // puts back must persist with it — the grid alone no longer holds it.
    const floatSizes = floatSizesSidecar();
    opts.onLayoutChange(
      JSON.stringify({
        // Lock marks are derived from strip membership (audit S1) and
        // must never persist — see withoutLockMarks. Popout state is
        // session-scoped the same way: a mid-popout save re-parents the
        // popped panels onto their hidden reference leaf so a reload
        // restores fully docked — see withoutPopoutGroups.
        //
        // Floating state is the opposite: a float persists DELIBERATELY
        // (design §3.3) via dockview's own `floatingGroups` key, which
        // `api.toJSON()` already emits and `api.fromJSON()` already
        // restores — nothing here scrubs it. `withoutFloatingGroups` exists
        // only as a LOAD-time retry (see loadBlobOrSeed) and must never be
        // called from this save path; the asymmetry with
        // `withoutPopoutGroups` above is that decision, not an omission.
        ...(withoutPopoutGroups(withoutLockMarks(api.toJSON())) as ReturnType<
          DockviewApi["toJSON"]
        >),
        rtcBlobVersion: DOCK_BLOB_VERSION,
        rtcDesignPins: intactDesignPins(),
        ...(stripGeometry === undefined
          ? {}
          : { rtcStripGeometry: stripGeometry }),
        ...(floatSizes === undefined ? {} : { rtcFloatSizes: floatSizes }),
      }),
    );
  }

  /** Each floating panel's remembered home extent, for the blob. Undefined
   * while nothing is remembered, so a float-free blob keeps its shape. An
   * entry whose panel has left the dock (closed while floating) describes
   * nothing and is not written. */
  function floatSizesSidecar():
    | Readonly<Record<string, PersistedFloatSize>>
    | undefined {
    const sizes: Record<string, PersistedFloatSize> = {};

    for (const [panelId, { along, size }] of floatHomeSizes) {
      if (api.getPanel(panelId) !== undefined) {
        sizes[panelId] = {
          axis: along === "vertical" ? "width" : "height",
          size,
        };
      }
    }

    return Object.keys(sizes).length === 0 ? undefined : sizes;
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

    // The ledger key already IS the sorted stripped panel ids (flipKeyFor);
    // keep only the ids still stripped, so the wire format stays exactly
    // what stripGeometryIn validates.
    for (const [key, size] of flippedSplits) {
      const panelIds = (JSON.parse(key) as readonly string[]).filter(
        (panelId) => {
          return records.has(panelId);
        },
      );

      if (panelIds.length > 0) {
        flips.push({ panelIds, size });
      }
    }

    return { records: recordSizes, flips };
  }

  // ——— Pop-out windows wear the opener's theme ———
  // dockview copies the opener's STYLESHEETS into a pop-out window
  // (`addStyles`), but a theme here is not only stylesheets: each client's
  // ThemeProvider writes the skin's token values as inline custom properties
  // on the opener's `<html>`, plus `data-skin` / `data-mode`, and every rule
  // reads them through `var(--…)`. A pop-out's own `<html>` carries none of
  // that, so every token resolved to nothing — text fell back to black and
  // the window ignored both the skin and light/dark (user report,
  // 2026-09-19). The engine owns pop-out windows, so it mirrors the opener's
  // root attributes into each one as it opens, and re-mirrors on every
  // change, so switching skin or mode repaints an open pop-out live.
  const openerRoot = opts.container.ownerDocument.documentElement;
  const popoutRoots = new Set<HTMLElement>();

  /** Makes `target`'s attributes exactly `openerRoot`'s — the inline token
   * properties (`style`) and `data-skin` / `data-mode` among them. */
  function mirrorOpenerRootInto(target: HTMLElement): void {
    for (const name of target.getAttributeNames()) {
      if (!openerRoot.hasAttribute(name)) {
        target.removeAttribute(name);
      }
    }

    for (const name of openerRoot.getAttributeNames()) {
      const value = openerRoot.getAttribute(name) ?? "";

      if (target.getAttribute(name) !== value) {
        target.setAttribute(name, value);
      }
    }
  }

  /** Re-mirrors the opener's root into every open pop-out window. */
  function mirrorOpenerRootIntoPopouts(): void {
    for (const root of popoutRoots) {
      mirrorOpenerRootInto(root);
    }
  }

  const openerRootObserver = new MutationObserver(mirrorOpenerRootIntoPopouts);

  openerRootObserver.observe(openerRoot, { attributes: true });

  const popoutAddSub = api.onDidAddPopoutGroup((popout) => {
    const root = popout.window.document.documentElement;

    popoutRoots.add(root);
    mirrorOpenerRootInto(root);
  });

  const popoutRemoveSub = api.onDidRemovePopoutGroup((popout) => {
    popoutRoots.delete(popout.window.document.documentElement);
  });

  // The popped set, published like strips: recomputed on every layout
  // change (dockview fires one for the pop-out transaction and again on
  // dock-home), compared, and handed to the client whole.
  let lastPopped: readonly string[] = [];
  let lastFloating: readonly string[] = [];

  function publishPoppedPanels(): void {
    const popped = api.groups
      .filter((group) => {
        return group.api.location.type === "popout";
      })
      .flatMap((group) => {
        return group.panels.map((panel) => {
          return panel.id;
        });
      })
      .sort();

    if (popped.join("\u0000") !== lastPopped.join("\u0000")) {
      lastPopped = popped;
      opts.onPopoutsChange?.(popped);
    }
  }

  /** Every panel currently in a floating group, sorted. */
  function floatingPanelIds(): readonly string[] {
    return api.groups
      .filter((group) => {
        return group.api.location.type === "floating";
      })
      .flatMap((group) => {
        return group.panels.map((panel) => {
          return panel.id;
        });
      })
      .sort();
  }

  function publishFloatingPanels(): void {
    const floating = floatingPanelIds();

    if (floating.join(" ") !== lastFloating.join(" ")) {
      lastFloating = floating;
      opts.onFloatsChange?.(floating);
    }
  }

  const changeSub = api.onDidLayoutChange(() => {
    publishPoppedPanels();
    publishFloatingPanels();
    // Pins are validated on EVERY layout change, not just at save time: a
    // drop that dissolves a rail must release its min=max clamps NOW, or
    // the next resize distributes against a phantom pin for up to
    // debounceMs (audit S2). The returned list is the persistence filter's
    // concern; here only the release side effect matters.
    intactDesignPins();

    if (timer !== null) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      timer = null;
      serializeLayout();
    }, debounceMs);
  });

  /** Lands a save still waiting out the debounce, now. A reload tears the
   * page down without unmounting anything — dispose's flush never runs — so
   * a change made inside the last `debounceMs` (a float, then a quick
   * reload) was simply lost. `pagehide` fires for a reload and a navigation
   * alike, early enough for the store's synchronous write to land. Only a
   * PENDING save is flushed: it is exactly the write the debounce would
   * have made, so this changes when a save lands, never whether. */
  function flushPendingSave(): void {
    if (timer === null) {
      return;
    }

    clearTimeout(timer);
    timer = null;
    serializeLayout();
  }

  const ownerWindow = opts.container.ownerDocument.defaultView;

  ownerWindow?.addEventListener("pagehide", flushPendingSave);

  // A float the blob restored must be published NOW: `loadBlobOrSeed` ran
  // `fromJSON` above, BEFORE `changeSub` subscribed, and dockview's
  // `onDidLayoutChange` is an AsapEvent that deliberately drops a fire
  // queued before its subscriber arrived (it snapshots the fire count at
  // subscribe time). Without this the restored float reaches the client
  // only at the NEXT float transition — until then the bridge renders it
  // with the docked control set (Collapse/Maximize, no Dock). Same path as
  // every later transition: a restore with no float publishes nothing.
  // (Popouts need no twin: they are session-scoped and never restored.)
  publishFloatingPanels();

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
  // strip of the split expands. Keyed by ALL direct members' panel ids
  // (worldKeyOf), not the split Element: a drop that adds or removes a
  // member changes the key, which VOIDS the old world — it describes an
  // arrangement that no longer exists, and re-asserting it over the new
  // membership yanks space from panels it never described (audit S3).
  const preStripWorlds = new Map<string, Map<string, number>>();
  // A split whose every group is a strip reclaims along its PARENT's axis
  // (the in-house `stripDir`): its own size on that axis is remembered here
  // while it is flipped, and restored the moment one of its strips expands.
  // Keyed by the SORTED STRIPPED PANEL IDS (flipKeyOf), not the split
  // Element: a drop rebuilds the split containers along its own path even
  // when groups survive (audit S3), and membership is the identity that
  // means "same column" — it is also exactly what the sidecar persists, so
  // the in-memory ledger and the wire format now share one key.
  const flippedSplits = new Map<string, number>();
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
  // The design pins holding the maximized panel whose clamps the maximize
  // lifted — a pin is min=max, so a pinned maximized group would otherwise
  // hold its design width beside a dock of bars instead of filling it. Lives
  // exactly as long as `maximized` (set by maximizePanel, drained by
  // releaseMaximize). The records themselves stay in `designPins`
  // throughout, so a save taken mid-maximize still persists them.
  let suspendedPins: readonly DesignPinRecord[] = [];

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

  /** The split currently holding the panels a flip entry is keyed by —
   * resolved fresh because drops rebuild split Elements (audit S3). Null
   * when none of the key's panels remain in the dock. */
  function splitForFlipKey(key: string): Element | null {
    const panelIds = JSON.parse(key) as readonly string[];

    for (const panelId of panelIds) {
      const split = groupOf(panelId)?.element.closest(SPLIT_SELECTOR) ?? null;

      if (split !== null) {
        return split;
      }
    }

    return null;
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
    // A bar has no visible header and its content is hidden — a drop into
    // it would swallow the dropped panel (audit S1). Reject drops for the
    // strip's whole lifetime; releaseStrip lifts this.
    group.api.locked = "no-drop-target";

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

    const key = worldKeyOf(split);
    const known = preStripWorlds.get(key);

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

    preStripWorlds.set(key, world);

    return world;
  }

  /** The identity of a split for the world ledger: ALL its direct members'
   * panel ids, sorted. A drop that adds or removes a member changes the
   * key, which voids the old world — see the ledger's own comment. */
  function worldKeyOf(split: Element): string {
    const panelIds: string[] = [];

    for (const member of directMembersOf(split)) {
      for (const heldPanel of member.panels) {
        panelIds.push(heldPanel.id);
      }
    }

    return flipKeyFor(panelIds);
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
    for (const [key, world] of [...preStripWorlds]) {
      const split = splitForWorldKey(world);

      if (split === null || worldKeyOf(split) !== key) {
        // Membership changed (or the panels left entirely): this world
        // describes a defunct arrangement — void it, never re-assert it.
        preStripWorlds.delete(key);
        continue;
      }

      if (holdsStrip(split)) {
        continue;
      }

      preStripWorlds.delete(key);
      const along = orientationAgainst(split);
      const members = directMembersOf(split);

      for (const member of members.slice(0, -1)) {
        const owned = world.get(member.panels[0]?.id ?? "");
        const axis = axisOf(member, along);

        // A member already at its size is left alone: re-setting it makes
        // dockview redistribute for nothing (and a migrated legacy world
        // can sit a fraction of a pixel off an integer model).
        if (owned !== undefined && Math.abs(axis.size() - owned) > 0.5) {
          axis.set(owned);
        }
      }
    }
  }

  /** The split currently holding a world's members — any of the world's
   * panel ids resolves it (they all lived in one split at capture). */
  function splitForWorldKey(
    world: ReadonlyMap<string, number>,
  ): Element | null {
    for (const panelId of world.keys()) {
      const split = groupOf(panelId)?.element.closest(SPLIT_SELECTOR) ?? null;

      if (split !== null) {
        return split;
      }
    }

    return null;
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
    group.api.locked = false;
    const naturalAxis = axisOf(group, record.natural);
    naturalAxis.constrain(record.minimum, record.maximum);
    axisOf(group, opposite(record.natural)).constrain(
      record.orthogonalMinimum,
      record.orthogonalMaximum,
    );

    return () => {
      naturalAxis.set(record.size);
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

    // The maximize is over: every pin it suspended clamps again — now that
    // its members are no longer maximize-forced strips, so the clamp lands
    // on the groups themselves (a member the USER collapsed has its strip
    // record patched instead). Constraints before sizes: this runs ahead of
    // the callers' settleStrips and size restores. A pin a sash drag released
    // meanwhile (unpinSplit dropped its record) or one whose shape dissolved
    // stays released.
    for (const record of suspendedPins) {
      if (
        designPins.includes(record) &&
        intactPinOwnerSplit(record, groupOf) !== null
      ) {
        clampPinMembers(record);
      }
    }

    suspendedPins = [];

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
      const key = flipKeyOf(split, stripped);

      if (!flippedSplits.has(key)) {
        const witness = firstStrippedGroupIn(split, stripped, groupOf);

        if (witness !== undefined) {
          // Same reload rule as recordStrip: a re-collapse after a blob
          // restore would measure the bar the blob stored, so a sidecar-
          // persisted pre-flip size wins over the live witness.
          const seededSize = seededFlipSizes.get(key);
          seededFlipSizes.delete(key);

          // The split's size on its PARENT's axis — a column's width — is
          // the axis orthogonal to the one its own children run along.
          flippedSplits.set(
            key,
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
        clampTo(naturalAxis, barModelFor(orientation));
      } else {
        naturalAxis.constrain(record.minimum, record.maximum);
        clampTo(orthogonalAxis, barModelFor(orientation));
      }
    }

    // Pass 4 — a split that is no longer flipped gets its remembered size
    // back, now that its strips' orthogonal clamps are released. Each entry
    // resolves its CURRENT split from its own panel ids (drops rebuild
    // split Elements — audit S3); a key whose panels left the dock entirely
    // is dropped without a restore.
    const nowFlippedKeys = new Set(
      [...nowFlipped].map((split) => {
        return flipKeyOf(split, stripped);
      }),
    );

    for (const [key, size] of [...flippedSplits]) {
      if (nowFlippedKeys.has(key)) {
        continue;
      }

      flippedSplits.delete(key);
      const split = splitForFlipKey(key);

      if (split !== null) {
        const witness = firstGroupIn(split, api.groups);

        if (witness !== undefined) {
          axisOf(witness, opposite(orientationAgainst(split))).set(size);
        }
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
  // Pins whose clamp is currently LIFTED because nothing is left to absorb
  // the container's spare space (see settlePinAbsorption). They are still
  // live pins — persisted in the blob, re-clamped as soon as an absorbing
  // panel returns — just not holding a min=max that would starve the grid.
  let unabsorbedPins: DesignPinRecord[] = [];
  // Pins whose clamp is LIFTED because a member of theirs has floated out of
  // the grid, keyed by the panel id whose float lifted them (R5).
  //
  // Deliberately NOT `unabsorbedPins`: that list is re-clamped the moment
  // some panel can absorb the container's spare space again, and an absorber
  // appearing elsewhere in the dock has nothing to do with a float. Sharing
  // the list would snap a floated box back to its design width because an
  // unrelated panel reopened. `settlePinAbsorption` reads neither this map
  // nor anything holding it, so the exclusion is structural, not a filter.
  const floatSuspendedPins = new Map<string, readonly DesignPinRecord[]>();
  // The unpinned dynamic panels (chart instances) and their design widths —
  // the members the R17 sharing rule sizes. Seeded from the construction
  // list too, so an unpinned panel a blob restored in place (reconcile never
  // re-inserts it) still counts; filled by insertDynamicPanel, emptied by
  // deleteDynamicPanel.
  const unpinnedDynamicPanels = new Map<string, number>(
    (opts.dynamicPanels ?? [])
      .filter((panel) => {
        return panel.unpinned === true;
      })
      .map((panel) => {
        return [panel.id, panel.initialPx] as const;
      }),
  );
  // Width-axis splits that owe a share (R18–R20), keyed by a member
  // INSTANCE's panel id, never a split Element — dockview rebuilds split
  // Elements on restructure, so the split is re-derived from the id's group
  // when the debt is paid (settleOwedShares). The cause scopes who may pay:
  // - "maximize": set during a live maximize — an instance opened or closed
  //   under it, or one the maximize STRIPPED inside its own boundary (R19) —
  //   and paid when that maximize ends (exit, switch, owner deleted/closed);
  // - "retained": the rule ran while the split held a strip (or a maximize's
  //   debt found one still there), kept for the expand of a strip in that
  //   same split, or for a later maximize whose boundary contains it.
  // Nothing else pays: a maximize that strips no instance, a collapse →
  // expand elsewhere, or a Jarvis dock's removal leaves a dragged width be.
  const owedShares = new Map<string, OwedShareCause>();
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
      // A member that is already OUT OF THE GRID at construction means the
      // blob restored a FLOAT holding this pin — floats are layer-3 persisted
      // (design §3.3) and `fromJSON` brings them back before this runs. The
      // pin must land SUSPENDED, exactly as `suspendPinsFor` would have left
      // it live: clamping min=max onto a floating member is the very state R5
      // exists to prevent, and it reaches the user as a float that reloads
      // stuck at its old rail width and refuses every resize.
      const absentMemberId = pin.panelIds.find((panelId) => {
        const group = groupOf(panelId);

        return group !== undefined && !isInGrid(group);
      });

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
        // children's), not once per panel. Pins persist the PUBLIC design
        // width — the card the user sees — so the model adds the gap.
        if (absentMemberId === undefined && !clamped.has(group.element)) {
          clamped.add(group.element);
          clampTo(axis, pin.px + GROUP_GAP_PX);
        }
      }

      const record = { pin, members, ownerSplit };

      if (absentMemberId === undefined) {
        designPins.push(record);
        continue;
      }

      // Keyed by the FIRST non-grid member, which is what the live path does
      // too: `suspendPinsFor` moves the record out of `designPins` on the
      // first float, so a second member floating later finds nothing to file.
      //
      // `ownerSplit` above is the FLOAT's own private gridview wrapper here,
      // not the grid split this pin shapes — `declaringSplitOf` walked up from
      // a floating group. That is tolerated only because a suspended record's
      // `ownerSplit` is never read, and only because
      // `clampPinsFloatSuspendedFor` re-derives it on promotion. Do not start
      // reading it here.
      floatSuspendedPins.set(absentMemberId, [
        ...(floatSuspendedPins.get(absentMemberId) ?? []),
        record,
      ]);
    }
  }

  /** Pins one newly-added panel's group at its design width — a dynamic
   * panel's own `applyDesignPins` of one, so it is held exactly like a
   * seeded rail's `initialPx` and released the same way on a sash drag. */
  function registerDesignPin(pin: DockDesignPin): void {
    applyDesignPins([pin]);
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

      // A pin the live maximize suspended is already released; releasing
      // it again is idempotent, and dropping its record here is what keeps
      // releaseMaximize from re-clamping it on exit.
      patchedStrips = releasePinMembers(record) || patchedStrips;
    }

    designPins = kept;

    if (patchedStrips) {
      settleStrips();
    }
  }

  /** Puts every member of `record` back to the constraints it had before the
   * pin, on the pin's axis only. A member that is currently a STRIP has its
   * strip record patched instead (the pin lives on in the record's captured
   * constraints, which settleStrips and expand would otherwise re-assert).
   * True when any strip record was patched — the caller owes a settleStrips. */
  function releasePinMembers(record: DesignPinRecord): boolean {
    const orientation = pinOrientationOf(record.pin);
    const released = new Set<Element>();
    let patchedStrips = false;

    for (const member of record.members) {
      const strip = records.get(member.panelId);

      if (strip !== undefined) {
        patchStripAxis(
          strip,
          orientation,
          member.previousMinimum,
          member.previousMaximum,
        );
        patchedStrips = true;
        continue;
      }

      const group = groupOf(member.panelId);

      if (group === undefined || released.has(group.element)) {
        continue;
      }

      released.add(group.element);
      const axis = axisOf(group, orientation);
      axis.constrain(member.previousMinimum, member.previousMaximum);
      // Loosening the GROUP is not enough on its own. dockview's branch node
      // caches its children's limits, and a pin applied at construction lands
      // before the first layout builds that cache — so the rail's branch goes
      // on reporting the pinned 367/367 to the root row after both of its
      // groups read 100/∞. The root row then keeps the sash disabled and the
      // rail cannot be dragged at all. Measured on a fresh boot: the pin was
      // found, matched and released, and the rail still never moved.
      //
      // Re-asserting the group's current size pushes the change through the
      // size path, which DOES make the branch recompute from its children —
      // the same constrain-then-set order a strip's expand already uses.
      axis.set(axis.size());
    }

    return patchedStrips;
  }

  /** Re-applies `record`'s clamp to every member — the inverse of
   * {@link releasePinMembers}: each GROUP clamped once at the pin's model
   * width (card + gap, as applyDesignPins does), a member that is a strip
   * having its strip record patched to the clamp so its expand lands pinned. */
  function clampPinMembers(record: DesignPinRecord): void {
    const orientation = pinOrientationOf(record.pin);
    const model = record.pin.px + GROUP_GAP_PX;
    const clamped = new Set<Element>();

    for (const member of record.members) {
      const strip = records.get(member.panelId);

      if (strip !== undefined) {
        patchStripAxis(strip, orientation, model, model);
        continue;
      }

      const group = groupOf(member.panelId);

      if (group === undefined || clamped.has(group.element)) {
        continue;
      }

      clamped.add(group.element);
      clampTo(axisOf(group, orientation), model);
    }
  }

  /** Lifts the clamp of every design pin holding `panelId` whose declaring
   * split lies inside the maximize `boundary` — the pins that divide the
   * space the maximize claims. A rail's width pin is declared by the row
   * ABOVE a nearest-column boundary, so that maximize (which fills only its
   * column's height) keeps it. Only the pin's own axis is lifted. Returns the
   * suspended records for releaseMaximize to re-clamp. */
  function suspendPinsHolding(
    panelId: string,
    boundary: Element,
  ): readonly DesignPinRecord[] {
    const suspended = designPins.filter((record) => {
      return (
        boundary.contains(record.ownerSplit) &&
        record.members.some((member) => {
          return member.panelId === panelId;
        })
      );
    });

    for (const record of suspended) {
      releasePinMembers(record);
    }

    return suspended;
  }

  /** Lifts and SETS ASIDE every design pin holding `panelId`, because its
   * group is leaving the grid for a float (R5). A pin is min=max: carried
   * into a float it would hold the box at the rail's design width and refuse
   * every resize.
   *
   * Unlike {@link suspendPinsHolding} (maximize's version, which leaves its
   * records in `designPins` so a mid-maximize save still persists them), the
   * records move OUT of `designPins` — a float can outlive any number of
   * layout changes, and `intactDesignPins` would dissolve a rail pin whose
   * member no longer shares the rail. They are persisted from this map
   * instead, and re-clamped by {@link clampPinsFloatSuspendedFor}. Called
   * only from `settleFloatTransitions`; true when it moved a record. */
  function suspendPinsFor(panelId: string): boolean {
    function holdsPanel(record: DesignPinRecord): boolean {
      return record.members.some((member) => {
        return member.panelId === panelId;
      });
    }

    const held = designPins.filter(holdsPanel);
    // A pin ALREADY lifted because nothing absorbs (Ruling 10) moves too
    // (final review I2). Left in `unabsorbedPins`, the next absorber to
    // return would re-clamp it ONTO the floating box, and the layout pass
    // after that would dissolve it for good. Its clamp is already lifted, so
    // there is nothing to release; `clampPinsFloatSuspendedFor` hands it back
    // to `designPins`, where `settlePinAbsorption` re-suspends it if the grid
    // still has nothing to trade against it.
    const unabsorbed = unabsorbedPins.filter(holdsPanel);

    if (held.length === 0 && unabsorbed.length === 0) {
      return false;
    }

    let patchedStrips = false;

    for (const record of held) {
      patchedStrips = releasePinMembers(record) || patchedStrips;
    }

    designPins = designPins.filter((record) => {
      return !held.includes(record);
    });
    unabsorbedPins = unabsorbedPins.filter((record) => {
      return !unabsorbed.includes(record);
    });
    floatSuspendedPins.set(panelId, [
      ...(floatSuspendedPins.get(panelId) ?? []),
      ...held,
      ...unabsorbed,
    ]);

    if (patchedStrips) {
      settleStrips();
    }

    return true;
  }

  /** Re-applies the pins `panelId`'s float suspended, now that it is docked
   * back in the grid — but only those that still describe reality, the same
   * `intactPinOwnerSplit` gate `releaseMaximize` applies on its own exit. A
   * pin whose members no longer share one rail (the panel docked somewhere the
   * pin never named) is dropped, already released.
   *
   * The promoted record carries the RE-DERIVED `ownerSplit`, never the one it
   * was suspended with. That field is a live DOM Element compared by identity
   * (`unpinSplit`, `suspendPinsHolding`), and a record suspended while its
   * member was outside the grid holds the wrong one: at construction it is the
   * FLOAT's private gridview wrapper, and even on the live path dockview is
   * free to rebuild a split across the round trip. Promoting it unchanged left
   * a reload-restored float's rail clamped min=max for the session with no
   * sash drag able to release it, because `unpinSplit` never matched. One
   * derivation, used for both the gate and the value it stores back.
   * Called only from `settleFloatTransitions`; true when `panelId` held any
   * suspended record. */
  function clampPinsFloatSuspendedFor(panelId: string): boolean {
    const held = floatSuspendedPins.get(panelId);

    if (held === undefined) {
      return false;
    }

    floatSuspendedPins.delete(panelId);

    for (const record of held) {
      const ownerSplit = intactPinOwnerSplit(record, groupOf);

      if (ownerSplit !== null) {
        clampPinMembers(record);
        designPins = [...designPins, { ...record, ownerSplit }];
      }
    }

    return true;
  }

  /** Every pin a float is currently holding lifted, dropping the entries
   * whose panel has since left the dock entirely (closed while floating) —
   * those describe nothing any more. */
  function floatSuspendedRecords(): readonly DesignPinRecord[] {
    for (const panelId of [...floatSuspendedPins.keys()]) {
      if (api.getPanel(panelId) === undefined) {
        floatSuspendedPins.delete(panelId);
      }
    }

    return [...floatSuspendedPins.values()].flat();
  }

  /** True while `group` is still laid out in THIS window's grid.
   *
   * `api.groups` is not pruned when a group leaves the grid, so every "what
   * is in the dock" question has to ask this rather than assume it. A panel
   * can stop being present in three ways — closed, popped out, floated — and
   * only the first removes it from `api.groups`. Named for the question, not
   * for today's answer, so a fourth way to leave the grid is one edit here.
   *
   * `?? "grid"` is deliberate: treating an unreported location as present is
   * the safe direction, since wrongly excluding a group would release a
   * constraint that is still doing its job. */
  function isInGrid(group: SizableGroup): boolean {
    return (group.api.location?.type ?? "grid") === "grid";
  }

  /** True while some panel can still absorb the container's spare space —
   * any panel that is IN THE GRID, not a member of `held`, and not currently
   * a STRIP. A collapsed panel sits at the strip extent, so it absorbs
   * nothing either.
   *
   * The grid filter is not defensive padding: `api.groups` is NOT pruned when
   * a group leaves the grid, so a popped-out panel (and, once Phase 6a lands,
   * a floating one) is still listed. Counting one as an absorber would hold
   * the pin clamped while the GRID has nothing left to fill it — the exact
   * starvation this function exists to detect, now invisible because a panel
   * in another window looked like it was helping. `publishPoppedPanels` reads
   * the same `location.type`; the `?? "grid"` keeps a group whose location
   * dockview does not report treated as present, which is the safe default. */
  function someGroupAbsorbs(held: readonly DesignPinRecord[]): boolean {
    const pinned = new Set<string>();

    for (const record of held) {
      for (const member of record.members) {
        pinned.add(member.panelId);
      }
    }

    return api.groups.some((group) => {
      if (!isInGrid(group)) {
        return false;
      }

      return group.panels.some((panel) => {
        return !pinned.has(panel.id) && !records.has(panel.id);
      });
    });
  }

  /** Suspends every design pin while nothing is left to trade against it,
   * and re-clamps it the moment something is — STATUS Phase-4 follow-up (b).
   *
   * A pin is a RELATIVE design width: the rail holds its pixels while some
   * other panel absorbs whatever the container has spare. A pin is min=max,
   * so once the last absorber goes the grid has no child able to take the
   * remaining space — dockview clamps the WHOLE GRID to the pinned extent
   * and the dock renders a void beside it. Measured on the FX rail pinned at
   * 360 in a 1200-wide dock: closing both unpinned panels took the grid from
   * 1200 to 367. The same seed with no pin hands the rail all 1200.
   *
   * SUSPEND, not release: the starved state is usually transient — closing
   * the last static panel and then opening a chart instance is the R18 path,
   * and that instance restores an absorber, so the rail must come back to its
   * design width rather than having forgotten it. Suspended pins keep their
   * records (so the blob still persists them) and re-clamp on the next call
   * that finds an absorber. Releasing outright is what a sash drag does, and
   * that stays the only way to lose a pin for good. */
  function settlePinAbsorption(): void {
    if (designPins.length === 0 && unabsorbedPins.length === 0) {
      return;
    }

    const absorbs = someGroupAbsorbs([...designPins, ...unabsorbedPins]);

    if (absorbs && unabsorbedPins.length > 0) {
      for (const record of unabsorbedPins) {
        clampPinMembers(record);
      }

      designPins = [...designPins, ...unabsorbedPins];
      unabsorbedPins = [];
    } else if (!absorbs && designPins.length > 0) {
      let patchedStrips = false;

      for (const record of designPins) {
        patchedStrips = releasePinMembers(record) || patchedStrips;
      }

      unabsorbedPins = [...unabsorbedPins, ...designPins];
      designPins = [];

      if (patchedStrips) {
        settleStrips();
      }
    } else {
      return;
    }

    // Changing min/max does not itself redistribute — dockview only reflows
    // on a layout pass, and two things conspire against a plain one here.
    // `api.width` is no use as the size: a starved grid ALREADY reads the
    // clamped extent, so laying out at it would keep the void; the
    // container's tracked size is the real dock. And when the grid did NOT
    // shrink (a strip absorbed the collapse instead) the tracked size EQUALS
    // the current one, which `DockviewComponent.layout` de-dupes away. Hence
    // forceResize: the distribution, not the dimensions, is what changed.
    api.layout(trackedWidth, trackedHeight, true);
  }

  /** The pins worth persisting: drops (and releases) any whose groups no
   * longer hold exactly the pinned panels — a tab dragged into or out of a
   * pinned group dissolves the pin rather than clamping a stranger. */
  function intactDesignPins(): readonly DockDesignPin[] {
    const kept: DesignPinRecord[] = [];

    for (const record of designPins) {
      if (intactPinOwnerSplit(record, groupOf) !== null) {
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

    // Suspended pins are still pins — their clamp is lifted so the grid can
    // fill, but the design width must survive a reload, or closing the last
    // absorbing panel would silently forget the rail's width for good. A
    // float's suspension (R5) persists for the same reason: a float IS
    // persisted (design §3.3), so a reload restores the float and must still
    // know the width to re-clamp when it docks home.
    return [...designPins, ...unabsorbedPins, ...floatSuspendedRecords()].map(
      (record) => {
        return record.pin;
      },
    );
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

  /** Opens `panel` as a brand-new group at the grid's right edge — never
   * stacked into an existing one. A pinned panel is held at its design width
   * exactly like a seeded rail; an `unpinned` one has its split shared by
   * rule (shareSplitAmongInstances), or owes that share when a maximize is
   * live. No-op if the id is already in the dock. */
  function insertDynamicPanel(panel: DockDynamicPanel): void {
    if (api.getPanel(panel.id) !== undefined) {
      return;
    }

    api.addPanel({
      id: panel.id,
      component: RTC_PANEL_COMPONENT,
      title: opts.panels.title(panel.id),
      position: { direction: "right" },
      initialWidth: panel.initialPx + GROUP_GAP_PX,
    });

    if (panel.unpinned === true) {
      unpinnedDynamicPanels.set(panel.id, panel.initialPx);
    } else {
      registerDesignPin({
        panelIds: [panel.id],
        px: panel.initialPx,
        axis: "width",
      });
    }

    // The newcomer may be the absorber a suspended pin was waiting for —
    // re-clamp BEFORE the share rule runs, so the rail is back at its design
    // width when the instances divide what is left.
    settlePinAbsorption();

    if (maximized !== null) {
      // A panel docked while a maximize is live must not land full-size next
      // to a dock of 32px strips — force it into the maximize's own strip
      // set via the SAME path maximizePanel uses (recordStrip, including its
      // lock semantics), and fold it into `maximized.stripped` so
      // exitMaximize restores it like any other panel the maximize forced.
      // The sharing rule is skipped: there is nothing to share while the
      // dock is bars.
      if (recordStrip(panel.id)) {
        maximized = {
          ...maximized,
          stripped: [...maximized.stripped, panel.id],
        };
        glide(settleStrips);
      }

      if (panel.unpinned === true) {
        owedShares.set(panel.id, "maximize"); // paid when the maximize ends
      }
    } else if (panel.unpinned === true) {
      shareInstanceSplitOf(panel.id);
    }
  }

  /** Closes a dynamic panel and its group. Restores anything the panel's own
   * maximize or collapse left behind before it goes — a maximize this panel
   * is the OWNER of releases in full (so the survivors' sizes are read back
   * while they still mean something), a strip it merely joined is dropped
   * from the record, and its own collapse (if any) is released so the
   * surrounding geometry settles before the group disappears. No-op for an
   * unknown id. */
  function deleteDynamicPanel(panelId: string): void {
    const panel = api.getPanel(panelId);

    if (panel === undefined) {
      return;
    }

    // Read while the owner still exists: deleting it ends the maximize, whose
    // owed shares are paid within this boundary once the survivors restore.
    const endedBoundary =
      maximized?.panelId === panelId ? liveMaximizeBoundary() : null;

    if (maximized?.panelId === panelId) {
      // releaseStrip (called per stripped id inside releaseMaximize) returns
      // a restore closure per panel; every one of them is discarded here —
      // deliberately. `settleStripFreeWorlds`, called below once this
      // panel's own group is gone, re-derives the SAME put-back for any
      // split whose membership is UNCHANGED by the removal (its captured
      // pre-strip world still matches), so calling the closures too would
      // just re-assert what it already restores. What this does NOT cover:
      // this panel's own split loses a member (this group), so that split's
      // captured world is voided rather than replayed (the membership-change
      // rule — audit S3) — a DIRECT SIBLING living in that same split (not
      // this panel itself, which is leaving regardless) therefore gets no
      // explicit put-back here; dockview's own resize distribution decides
      // its size once it inherits the freed space. Acceptable: the freed
      // space must land somewhere, and a sibling's own pre-maximize size is
      // no longer the only defensible answer once its split's shape changed.
      releaseMaximize();
    } else if (maximized !== null) {
      maximized = {
        ...maximized,
        stripped: maximized.stripped.filter((id) => {
          return id !== panelId;
        }),
      };
    }

    if (records.has(panelId)) {
      // Restore the surrounding geometry while the group still exists.
      releaseStrip(panelId);
      records.delete(panelId); // releaseStrip bails on a gone group; belt-and-braces.
    }

    // Removal can rebuild or collapse split Elements, so the split that held
    // an unpinned panel is re-resolved afterwards through a surviving
    // unpinned sibling — none left means nothing to re-share. Resolved while
    // this panel still counts as an instance (a stacked column of instances
    // shares its PARENT split).
    const heldBy = unpinnedDynamicPanels.has(panelId)
      ? instanceSplitOf(panelId)
      : null;

    const siblingId = [...unpinnedDynamicPanels.keys()].find((id) => {
      return (
        id !== panelId && heldBy !== null && instanceSplitOf(id) === heldBy
      );
    });
    const wasUnpinned = unpinnedDynamicPanels.delete(panelId);
    owedShares.delete(panelId);

    api.removePanel(panel);
    settleStrips();
    settleStripFreeWorlds();

    if (wasUnpinned && siblingId !== undefined) {
      if (maximized === null) {
        shareInstanceSplitOf(siblingId);
      } else {
        owedShares.set(siblingId, "maximize"); // paid when the maximize ends
      }
    }

    if (endedBoundary !== null) {
      settleMaximizeShares(endedBoundary);
    }
  }

  /** Runs the sharing rule over the width-axis split `instanceId` shares and
   * pays that split's owed shares with it — nothing outside it. The mark is
   * kept ("retained") while the split holds a strip, whose expand restores a
   * size the rule never accounted for. */
  function shareInstanceSplitOf(instanceId: string): void {
    const split = instanceSplitOf(instanceId);

    if (split === null) {
      return;
    }

    owedShares.set(instanceId, owedShares.get(instanceId) ?? "retained");
    settleOwedShares((_cause, owedSplit) => {
      return owedSplit === split;
    });
  }

  /** Pays the shares an ended maximize owes: those it caused, and any kept
   * for a split inside its boundary (the maximize restored that geometry). */
  function settleMaximizeShares(boundary: Element): void {
    settleOwedShares((cause, split) => {
      return cause === "maximize" || boundary.contains(split);
    });
  }

  /** Pays the owed shares `shouldPay` selects, once geometry is restored:
   * re-derives each marked instance's split, re-runs the rule there, and
   * clears the marks unless the split still holds a strip (kept as
   * "retained"). A mark whose instance no longer shares a width-axis split
   * is dropped. No-op while a maximize is live. */
  function settleOwedShares(
    shouldPay: (cause: OwedShareCause, split: Element) => boolean,
  ): void {
    if (maximized !== null || owedShares.size === 0) {
      return;
    }

    const owedBySplit = new Map<Element, string[]>();

    for (const [instanceId, cause] of [...owedShares]) {
      const split = instanceSplitOf(instanceId);

      if (split === null) {
        owedShares.delete(instanceId);
        continue;
      }

      if (shouldPay(cause, split)) {
        owedBySplit.set(split, [...(owedBySplit.get(split) ?? []), instanceId]);
      }
    }

    for (const [split, instanceIds] of owedBySplit) {
      shareSplitAmongInstances(split);
      const stillStripped = holdsStripChild(split);

      for (const instanceId of instanceIds) {
        if (stillStripped) {
          owedShares.set(instanceId, "retained");
        } else {
          owedShares.delete(instanceId);
        }
      }
    }
  }

  /** The live maximize's boundary element, read while its owner exists —
   * the in-house `maximizeBoundaryPath`, as maximizePanel derived it. */
  function liveMaximizeBoundary(): Element {
    const owner = maximized === null ? undefined : groupOf(maximized.panelId);

    return owner === undefined || maximized === null
      ? opts.container
      : maximizeBoundaryOf(
          owner.element,
          opts.panels.maximizeScope?.(maximized.panelId) ?? "root",
          opts.container,
        );
  }

  /** The WIDTH-axis split (children side by side) an unpinned instance
   * shares space in — the only kind the rule acts on (R20). A split made
   * only of instance groups (a column the user stacked instances into) is
   * ONE member of its parent, so it is stepped over. An instance dragged
   * into a column that also holds a static panel shares nothing: that
   * column is a static member of its parent, and a column's heights are
   * never the rule's. Null then, or when the instance is gone. */
  function instanceSplitOf(instanceId: string): Element | null {
    const group = groupOf(instanceId);

    // R6 (Phase 6 design §3.2): a floating instance leaves the share rule.
    // The exclusion has to be EXPLICIT, and location is the only test that
    // works: dockview mounts every float through its own private nested
    // gridview whose wrapper carries the very same
    // `.dv-split-view-container` class the grid's splits do (measured, Task 1
    // Q2), and that private split has no split parent and is not
    // `dv-vertical` — so the walk below would return it and the rule would go
    // on to "share" a row of one floating group, resizing a box the user
    // placed by hand. A DOM-class test cannot see the difference (Ruling 5).
    if (group === undefined || !isInGrid(group)) {
      return null;
    }

    let split = group.element.closest(SPLIT_SELECTOR);

    while (split !== null) {
      const parent = split.parentElement?.closest(SPLIT_SELECTOR) ?? null;
      const inside = api.groups.filter((group) => {
        return split?.contains(group.element) === true;
      });

      if (parent !== null && designPxOfInstanceChild(inside) !== undefined) {
        split = parent;
        continue;
      }

      return sharesWidth(split) ? split : null;
    }

    return null;
  }

  /** The nearest width-axis split above `panelId`'s group — the split a
   * vertical strip of it reclaimed its width along. */
  function widthSplitAbove(panelId: string): Element | null {
    let split = groupOf(panelId)?.element.closest(SPLIT_SELECTOR) ?? null;

    while (split !== null && !sharesWidth(split)) {
      split = split.parentElement?.closest(SPLIT_SELECTOR) ?? null;
    }

    return split;
  }

  /** Whether any direct child of `split` is a strip — the geometry a later
   * expand restores, which the rule cannot have shared. */
  function holdsStripChild(split: Element): boolean {
    return childViewsOf(split).some((child) => {
      const groups = api.groups.filter((group) => {
        return child.contains(group.element);
      });

      return groups.length > 0 && isStripView(groups);
    });
  }

  /** The R17–R20 sharing rule over one WIDTH-axis split (children side by
   * side; any other split is ignored): instances get their design width;
   * when there isn't room, instances and the main area share equally.
   * SAFE TO CALL AFTER ANY GEOMETRY RESTORE (an exit, an expand, a viewport
   * resize settling): it reads only live sizes, constraints, strip records
   * and design pins, holds no state, and is idempotent on a shared split.
   *
   * Only the split's children that are neither design-pinned (a pin declared
   * on this split's axis — a seeded rail, a Jarvis dock) nor strips take
   * part. A child made only of unpinned instance groups — a lone instance,
   * or a column/tab stack the user built out of instances — is ONE instance
   * member (its own internal split keeps its proportions); anything else is
   * a static member. `U` is the members' total size along the split, `n` the
   * instance members, and each instance member is set to
   * `min(designModel, floor(U / (n + 1)))` — the `+1` being the static
   * member(s), typically the main area — or, when the split has no static
   * member, `floor(U / n)` with the last instance taking the integer
   * remainder. Every share is floored at the member's current minimum on the
   * axis, so the rule never itself pushes a group under dockview's minimum;
   * when even the minimums don't fit, the row overflows exactly as dockview
   * lays out any over-constrained split — the rule does not fight that.
   * Pinned children and strips are never resized.
   *
   * Mechanism — constraints before sizes. dockview settles a `setSize` by
   * walking the delta back from the split's LAST view, so a bare set of
   * instance k would land on instances after it (the file's all-but-last
   * trap). Each instance is therefore clamped min=max to its share in DOM
   * order: by the time the last one is clamped, no other instance can move,
   * and every remaining delta — including the integer remainder `U − n·w` —
   * can only land on the unpinned static member. The clamps are then released
   * back to each group's own constraints: releasing changes no size (dockview
   * re-lays out at the current sizes), and nothing is recorded as a pin. */
  function shareSplitAmongInstances(split: Element | null): void {
    // Width axis only (R20): a column's heights are never the rule's.
    if (split === null || !sharesWidth(split)) {
      return;
    }

    const along = orientationAgainst(split);
    const instances: SharedInstance[] = [];
    let sharedTotal = 0;
    let staticMembers = 0;

    for (const child of childViewsOf(split)) {
      const groups = api.groups.filter((group) => {
        return child.contains(group.element);
      });

      if (
        groups.length === 0 ||
        isStripView(groups) ||
        isPinnedView(child, split)
      ) {
        continue;
      }

      const axes = groups.map((group) => {
        return axisOf(group, along);
      });
      sharedTotal += axes[0]?.size() ?? 0;
      const designPx = designPxOfInstanceChild(groups);

      if (designPx === undefined) {
        staticMembers += 1;
      } else {
        instances.push({ axes, designModel: designPx + GROUP_GAP_PX });
      }
    }

    if (instances.length === 0) {
      return;
    }

    const share = Math.floor(
      sharedTotal / (instances.length + (staticMembers > 0 ? 1 : 0)),
    );
    const releases: (() => void)[] = [];

    for (const [index, { axes, designModel }] of instances.entries()) {
      const isLast = index === instances.length - 1;
      const target =
        staticMembers > 0
          ? Math.min(designModel, share)
          : isLast
            ? sharedTotal - share * (instances.length - 1)
            : share;

      const size = Math.max(
        target,
        ...axes.map((axis) => {
          return axis.minimum();
        }),
      );

      // Every group of the member held first (a stacked column's width is
      // the meet of its groups'), then the member sized once.
      for (const axis of axes) {
        const minimum = axis.minimum();
        const maximum = axis.maximum();

        releases.push(() => {
          axis.constrain(minimum, maximum);
        });
        axis.constrain(size, size);
      }

      axes[0]?.set(size);
    }

    for (const release of releases) {
      release();
    }
  }

  /** `split`'s direct child views, in DOM order — each one a leaf group's
   * view or a nested split's. */
  function childViewsOf(split: Element): readonly Element[] {
    const views: Element[] = [];

    for (const group of api.groups) {
      const view = railViewOf(group.element, split);

      if (view !== null && !views.includes(view)) {
        views.push(view);
      }
    }

    return views.sort((a, b) => {
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
        ? -1
        : 1;
    });
  }

  /** A child whose every group is a strip — a lone bar, or a fully-stripped
   * (flipped) column — holds the bar's size and never shares. */
  function isStripView(groups: readonly SizableGroup[]): boolean {
    return groups.every((group) => {
      return group.panels.some((panel) => {
        return records.has(panel.id);
      });
    });
  }

  /** A child held by a live design pin declared on THIS split's axis (a pin
   * declared by a nested split sizes the other axis and doesn't count). The
   * declaring split is re-derived from the member's live DOM, not the
   * record's `ownerSplit` Element: closing the main column collapses the
   * root, and a stale Element would count the still-clamped rail as a static
   * member. */
  function isPinnedView(child: Element, split: Element): boolean {
    return designPins.some((record) => {
      return record.members.some((member) => {
        const group = groupOf(member.panelId);

        return (
          group !== undefined &&
          child.contains(group.element) &&
          declaringSplitOf(group.element, record.pin.axis) === split
        );
      });
    });
  }

  /** The design width of a child whose groups hold ONLY unpinned dynamic
   * panels (the largest member's) — undefined for anything else: a static
   * panel, a pinned dock, an instance a drag stacked beside a static tab. */
  function designPxOfInstanceChild(
    groups: readonly SizableGroup[],
  ): number | undefined {
    let designPx: number | undefined;

    for (const group of groups) {
      for (const panel of group.panels) {
        const px = unpinnedDynamicPanels.get(panel.id);

        if (px === undefined) {
          return undefined;
        }

        designPx = Math.max(designPx ?? 0, px);
      }
    }

    return designPx;
  }

  applyDesignPins(restored.pins);
  reconcileDynamicPanels();
  applyTitles(api, opts.panels); // reconciled-in panels get titles too

  /** Membership-only reconciliation of `opts.dynamicPanels` against whatever
   * `loadBlobOrSeed` just restored: a listed id already present (kept from
   * the blob, or seeded — seeds never carry dynamic ids, but this stays
   * generic) is left exactly where it landed; a listed id still absent is
   * added at the right edge via the normal `insertDynamicPanel` path; a
   * dynamic id the blob restored that is no longer listed is removed via
   * `deleteDynamicPanel` — an orphan the app stopped tracking, not part of
   * the seed. Runs once, at construction, after `loadBlobOrSeed`'s own
   * scrub-and-retry net has already done what it can with a corrupt blob. */
  function reconcileDynamicPanels(): void {
    const staticIds = new Set(seedPanelIdsOf(opts.seed));
    const listed = new Map(
      (opts.dynamicPanels ?? []).map((panel) => {
        return [panel.id, panel] as const;
      }),
    );

    for (const panel of [...api.panels]) {
      if (!staticIds.has(panel.id) && !listed.has(panel.id)) {
        deleteDynamicPanel(panel.id);
      }
    }

    for (const panel of listed.values()) {
      if (api.getPanel(panel.id) === undefined) {
        insertDynamicPanel(panel);
      }
    }
  }

  opts.container.addEventListener("pointerdown", armSashUnpin, true);

  /** True while any panel of `group` is a STRIP — the group is a collapsed
   * panel's 32px bar. A strip is always alone in its group (`recordStrip`
   * ejects a panel into its own group before clamping it), so for a collapsed
   * panel this is exactly `records.has(panelId)` — spelled over the GROUP for
   * the callers that have one rather than an id. One predicate, two callers,
   * so the button and gesture refusals cannot drift apart (Ruling 11's
   * lesson). */
  function holdsStrippedPanel(group: SizableGroup): boolean {
    return group.panels.some((panel) => {
      return records.has(panel.id);
    });
  }

  /** The group a shift-drag float gesture would act on: the one whose
   * `.dv-groupview` element encloses the pointerdown's target. The same
   * element-identity lookup `directMembersOf` uses — `group.element` IS the
   * `.dv-groupview`. */
  function gestureGroupOf(target: Element): SizableGroup | undefined {
    const element = target.closest(GROUP_SELECTOR);

    return element === null
      ? undefined
      : api.groups.find((candidate) => {
          return candidate.element === element;
        });
  }

  /** Cancels a shift-drag-to-float gesture that `floatPanel` would refuse —
   * a live maximize (R4) or a collapsed panel (R8). The gesture half of
   * `floatPanel`'s own refusals, on the same two conditions.
   *
   * MEASURED, and NOT the mechanism the design named. dockview 8.3.1 starts
   * that gesture from a POINTERDOWN — one listener on a tab, one on the tab
   * bar's void container — and each calls `addFloatingGroup` itself after
   * `event.preventDefault()`, having first bailed when the event was ALREADY
   * `defaultPrevented`. The public `onWillDragGroup` hook fires from
   * `onGroupDragStart`, i.e. an HTML5 `dragstart`, which the gesture's own
   * preventDefault stops from ever happening — subscribing to it would veto
   * ordinary group drags and never see a float. So the only reachable veto is
   * that pointerdown, taken in the CAPTURE phase on our own container, ahead
   * of dockview's target-phase listeners.
   *
   * Scoped twice over, so the veto is exactly as wide as the refusal:
   * - to the two elements that own the gesture, so a future dockview shift
   *   affordance is not silently disabled here too;
   * - to a group that is IN THE GRID, because on a group that is ALREADY
   *   floating the very same shift-pointerdown is dockview's REDOCK gesture
   *   (`VoidContainer`'s `isFloatingMoveHandle`), and preventing the default
   *   there would break dragging a float home. */
  function cancelRefusedShiftFloat(event: Event): void {
    if (
      !(event instanceof MouseEvent) ||
      !event.shiftKey ||
      !(event.target instanceof Element) ||
      event.target.closest(FLOAT_GESTURE_SELECTOR) === null
    ) {
      return;
    }

    const group = gestureGroupOf(event.target);

    if (group === undefined || !isInGrid(group)) {
      return;
    }

    if (maximized !== null || holdsStrippedPanel(group)) {
      event.preventDefault();
    }
  }

  opts.container.addEventListener("pointerdown", cancelRefusedShiftFloat, true);

  /** True from a head press `moveFloatFromHead` took over until its pointer
   * is released — the window in which the head's own tab must not start an
   * HTML5 drag (see `cancelHeadTabDrag`). */
  let movingFloatFromHead = false;

  /** Moves a float by its head: a plain press anywhere on a floating group's
   * head that is not one of its own controls becomes a press on the group's
   * void container — the element dockview's overlay drags the float from
   * under `floatingGroupDragHandle: "tabbar"`. The in-house head fills the
   * whole tab, leaving that void container 0px wide, so without this a
   * float could not be moved by anything a user would try to grab.
   *
   * Left alone, in turn:
   * - a shift-press: on a float that is dockview's REDOCK gesture (drag the
   *   tab back into the grid), which keeps working unchanged;
   * - a press on a control — a head button, the quick-filter input — which
   *   keeps its own meaning, exactly as a dialog's close button does;
   * - any group in the grid: there the head's drag is the rearrange DnD.
   *
   * Captured on our own container, ahead of the tab's own listeners, and
   * stopped there so the tab never also starts a panel drag. The forwarded
   * event is a real `PointerEvent` carrying the original pointer and
   * coordinates; dockview's overlay reads its drag offset from the first
   * move, so where on the head the press landed is where the float stays
   * held. */
  function moveFloatFromHead(event: Event): void {
    if (
      !(event instanceof PointerEvent) ||
      event.button !== 0 ||
      event.shiftKey ||
      !(event.target instanceof Element) ||
      event.target.closest(HEAD_CONTROL_SELECTOR) !== null ||
      // A press ON the void container is already dockview's own move — and
      // is exactly the press this function dispatches, which passes back
      // through this capture listener on its way down: without this it
      // re-forwards itself until the stack gives out.
      event.target.closest(VOID_CONTAINER_SELECTOR) !== null
    ) {
      return;
    }

    const head = event.target.closest(HEAD_BAR_SELECTOR);
    const group = head === null ? undefined : gestureGroupOf(head);
    const handle = head?.querySelector(VOID_CONTAINER_SELECTOR);

    if (
      group === undefined ||
      group.api.location?.type !== "floating" ||
      handle === null ||
      handle === undefined
    ) {
      return;
    }

    event.stopPropagation();
    movingFloatFromHead = true;
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        pointerId: event.pointerId,
        pointerType: event.pointerType,
        isPrimary: event.isPrimary,
        button: event.button,
        buttons: event.buttons,
        clientX: event.clientX,
        clientY: event.clientY,
      }),
    );
  }

  /** Ends the head-move window `moveFloatFromHead` opened. */
  function endFloatHeadMove(): void {
    movingFloatFromHead = false;
  }

  /** Stops the head's tab from starting an HTML5 drag while that press is
   * moving the float: `draggable` tabs raise `dragstart` from mouse movement
   * whatever the pointerdown's fate, and a started drag would steal the
   * pointer from the move. */
  function cancelHeadTabDrag(event: Event): void {
    if (movingFloatFromHead) {
      event.preventDefault();
    }
  }

  opts.container.addEventListener("pointerdown", moveFloatFromHead, true);
  opts.container.addEventListener("dragstart", cancelHeadTabDrag, true);
  window.addEventListener("pointerup", endFloatHeadMove, true);
  window.addEventListener("pointercancel", endFloatHeadMove, true);

  // ——— Float home sizes (dock-home puts back the extent, not just the slot) ———
  // Every in-grid panel's extent along its parent split's dividing axis, as
  // the CURRENT structural mutation opened. `settleFloatTransitions` runs on
  // `onDidMutateLayout`, i.e. after the float has already detached the group
  // — by then its grid extent is gone (the siblings have absorbed it) and the
  // floating box has its own size. `onWillMutateLayout` fires at the opening
  // of that very same top-level mutation, with the group still laid out in
  // the grid, for EVERY entry point: dockview brackets `addFloatingGroup`
  // itself (the button and the shift-drag gesture both land there), so the
  // snapshot and the settle always describe one transaction.
  let preMutationExtents: ReadonlyMap<string, FloatHomeSize> = new Map();

  function snapshotGridExtents(): void {
    const extents = new Map<string, FloatHomeSize>();

    for (const group of api.groups) {
      const split = isInGrid(group)
        ? group.element.closest(SPLIT_SELECTOR)
        : null;

      if (split === null) {
        continue;
      }

      const along = orientationAgainst(split);
      const size = axisOf(group, along).size();

      for (const panel of group.panels) {
        extents.set(panel.id, { along, size });
      }
    }

    preMutationExtents = extents;
  }

  const willMutateSub = api.onWillMutateLayout(snapshotGridExtents);

  /** True for a panel whose docked extent another rule already owns, so a
   * remembered float size would fight it — two mechanisms over one extent
   * is worse than either:
   * - a design-pin member: its pin re-clamps on dock-home
   *   (`clampPinsFloatSuspendedFor`) and restores the designed size itself;
   * - a chart instance (an unpinned dynamic panel): on dock-home it re-enters
   *   the equal-share rule (R6), which decides every instance's width.
   * Pin records are looked up in all three homes a record can sit in. */
  function hasOwnDockHomeSizing(panelId: string): boolean {
    if (unpinnedDynamicPanels.has(panelId)) {
      return true;
    }

    return [
      ...designPins,
      ...unabsorbedPins,
      ...[...floatSuspendedPins.values()].flat(),
    ].some((record) => {
      return record.members.some((member) => {
        return member.panelId === panelId;
      });
    });
  }

  // Each floating panel's pre-float extent, keyed by panel id — recorded as
  // it floats, re-applied and forgotten as it docks home. Seeded from the
  // blob's `rtcFloatSizes` sidecar, keeping only entries for a panel that
  // actually came back floating and is not excluded above (a stale entry for
  // a docked panel describes nothing a dock-home could consume).
  const floatHomeSizes = new Map<string, FloatHomeSize>();

  for (const [panelId, entry] of restored.floatSizes) {
    const panel = api.getPanel(panelId);

    if (
      panel !== undefined &&
      panel.group.api.location.type === "floating" &&
      !hasOwnDockHomeSizing(panelId)
    ) {
      floatHomeSizes.set(panelId, entry);
    }
  }

  /** Remembers `panelId`'s pre-float extent from the snapshot taken as the
   * mutation that floated it opened. Nothing is recorded for an excluded
   * panel, or for one with no grid extent before this mutation (it entered
   * the float from outside the grid — a pop-out, or a panel added floating). */
  function rememberFloatHomeSize(panelId: string): void {
    const extent = preMutationExtents.get(panelId);

    if (extent !== undefined && !hasOwnDockHomeSizing(panelId)) {
      floatHomeSizes.set(panelId, extent);
    }
  }

  /** Puts back each remembered extent whose panel is back IN THE GRID —
   * however it got there — then forgets it. An entry whose panel is still
   * floating (or popped out of its float) waits; one whose panel left the
   * dock is dropped.
   *
   * Goes through the axis `set` the strip restores use, after reading the
   * constraints: the target is clamped to the group's own min/max, and to the
   * room its split can give — the group's current extent plus what each
   * sibling view holds ABOVE its minimum — so a container resized or a
   * sibling closed in the meantime lands what fits and never pushes a sibling
   * below its minimum (dockview's splitview would refuse to anyway; the clamp
   * makes the engine ask only for what it can have). A group that docked into
   * a split dividing the OTHER axis gets nothing: its old extent measures a
   * dimension its new home does not share out. Neither does a panel that
   * landed as a TAB in a group holding others (a drop on a group's centre):
   * a tab join is not a return home, and sizing the group it joined would
   * resize that sibling to the floated panel's old extent.
   *
   * While a maximize is live the whole pass is DEFERRED, entries kept: a
   * float can still be dragged home then (only the head control is hidden),
   * and re-applying under the maximize would shrink the maximized panel.
   * `exitMaximize` runs the pass once the maximize has restored; the other
   * ways a maximize ends (its owner closed or deleted) are dockview
   * mutations, which reach the pass through `settleFloatTransitions`. */
  function restoreFloatHomeSizes(): void {
    if (maximized !== null) {
      return;
    }

    for (const [panelId, entry] of [...floatHomeSizes]) {
      const panel = api.getPanel(panelId);

      if (panel === undefined) {
        floatHomeSizes.delete(panelId);
        continue;
      }

      if (!isInGrid(panel.group)) {
        continue;
      }

      floatHomeSizes.delete(panelId);
      const group: SizableGroup = panel.group;
      const split = group.element.closest(SPLIT_SELECTOR);

      if (
        split === null ||
        group.panels.length > 1 ||
        orientationAgainst(split) !== entry.along ||
        hasOwnDockHomeSizing(panelId)
      ) {
        continue;
      }

      const axis = axisOf(group, entry.along);
      const size = Math.max(
        axis.minimum(),
        Math.min(
          entry.size,
          axis.maximum(),
          dockHomeRoomOf(group, split, entry.along),
        ),
      );

      if (Math.abs(axis.size() - size) > 0.5) {
        axis.set(size);
      }
    }
  }

  /** The most `group` can grow to along `along` inside `split` without
   * pushing a sibling view below its minimum: its own extent plus each
   * sibling view's slack. A sibling view that is a nested split is as small
   * as its largest group minimum allows (its groups stack across `along`). */
  function dockHomeRoomOf(
    group: SizableGroup,
    split: Element,
    along: DockStripOrientation,
  ): number {
    let room = 0;

    for (const child of childViewsOf(split)) {
      const groups = api.groups.filter((candidate) => {
        return child.contains(candidate.element);
      });
      const first = groups[0];

      if (first === undefined) {
        continue;
      }

      const extent = axisOf(first, along).size();

      if (child.contains(group.element)) {
        room += extent;
        continue;
      }

      room +=
        extent -
        Math.max(
          ...groups.map((member) => {
            return axisOf(member, along).minimum();
          }),
        );
    }

    return room;
  }

  // The floating set the pin, absorption and share rules were last settled
  // against. Seeded from the restored layout: a float the blob brought back
  // already had its pins routed by `applyDesignPins`, so it is not a new one.
  let settledFloating: ReadonlySet<string> = new Set(floatingPanelIds());

  /** Applies the float rules (R5, Ruling 10, R6) to whatever changed since
   * the last structural mutation — ONE mechanism for every way a panel
   * enters or leaves a float (final review I1). `floatPanel` and `dockPanel`
   * are two of them; dockview's own shift-drag float, a drag of a float onto
   * the grid, and a pop-out window closing back into the grid are the
   * others, and they call `addFloatingGroup` / `moveGroupOrPanel` themselves
   * without ever reaching the verbs. When the rules lived on the verbs, the
   * gesture path left a float clamped min=max until the next layout pass —
   * where `intactDesignPins` then dissolved the pin for good — and a
   * shift-drag of the last absorber brought back the #745 void.
   *
   * Run from `onDidMutateLayout`, which dockview fires SYNCHRONOUSLY when a
   * top-level mutation closes (float, move, add, remove, load …) — not from
   * `onDidLayoutChange`, which is buffered to a microtask: a verb's caller
   * reads the settled state the moment the verb returns, and the gesture's
   * transient clamp never exists at all. Every step is idempotent, so a
   * mutation that touched no float costs one scan of `api.groups`.
   *
   * - R5: every floating member's pins are suspended (a record already moved
   *   finds nothing), and every float-suspended record whose panel is back
   *   IN THE GRID re-clamps — however it got there.
   * - Ruling 10: a float removes an absorber exactly as a close does, and a
   *   returning panel can absorb again, so absorption is re-settled.
   * - R6: a chart instance that left a float for the grid re-enters the
   *   equal-share rule at once, as `insertDynamicPanel` does for a newcomer —
   *   not at the next container resize (final review I4).
   * - Home sizes: a panel entering a float has its pre-float extent
   *   remembered (from the snapshot `onWillMutateLayout` took as this same
   *   mutation opened), and a remembered panel back in the grid has it put
   *   back — LAST, once pins are re-clamped and absorption re-settled, so the
   *   room it measures is the room the settled grid really has. */
  function settleFloatTransitions(): void {
    const floating = new Set(floatingPanelIds());
    const left = [...settledFloating].filter((panelId) => {
      return !floating.has(panelId);
    });

    const entered = [...floating].filter((panelId) => {
      return !settledFloating.has(panelId);
    });

    let changed = left.length > 0 || entered.length > 0;

    settledFloating = floating;

    for (const panelId of entered) {
      rememberFloatHomeSize(panelId);
    }

    for (const panelId of floating) {
      changed = suspendPinsFor(panelId) || changed;
    }

    for (const panelId of [...floatSuspendedPins.keys()]) {
      const panel = api.getPanel(panelId);

      if (panel !== undefined && isInGrid(panel.group)) {
        changed = clampPinsFloatSuspendedFor(panelId) || changed;
      }
    }

    if (changed) {
      settlePinAbsorption();

      for (const panelId of left) {
        const panel = api.getPanel(panelId);

        if (
          panel !== undefined &&
          isInGrid(panel.group) &&
          unpinnedDynamicPanels.has(panelId)
        ) {
          shareInstanceSplitOf(panelId);
        }
      }
    }

    // Outside the gate: a panel popped out OF a float returns to the grid
    // without the floating set changing at all.
    restoreFloatHomeSizes();
  }

  const mutateSub = api.onDidMutateLayout(settleFloatTransitions);

  // Whether a user has been inside the dock since construction — the ORIGIN
  // test for what dispose may persist. Layer 3 persists ARRANGEMENT (sash
  // drags, DnD, restacks, and the maximize/collapse/pop-out buttons, all of
  // which live inside this container); everything else that mutates the grid
  // before a user touches it — pins, the dynamic-panel reconcile, a bridge's
  // maximize/collapse/closed replays, a settle-time resize — is re-derived
  // from options and layer-2 state on the next construction. Content can't
  // tell those apart (a replay changes the grid exactly as a click does);
  // origin can. Over-approximates safely: a plain click also sets it, but a
  // human click only happens once the container has settled.
  let userArranged = false;

  function markUserArranged(): void {
    userArranged = true;
  }

  opts.container.addEventListener("pointerdown", markUserArranged, true);

  // A pristine grid tracks its source EXACTLY through container resizes.
  //
  // The construction above measures the container once, and an eager mount
  // can measure it before the chrome above has settled (981px, settling to
  // 980 — measured on app/fx-dockview). Dockview's shell observer then lays
  // the grid out proportionally to the settled size, and a proportional
  // rescale between two integer extents is lossy: the tiles/blotter sash comes
  // out 1px off what a construction at 980 renders. So while no user has
  // arranged the dock (see userArranged), each settled size re-derives the
  // exact grid from the source and re-applies its sizes in place.
  //
  // Our own observer, not dockview's: 8.3.1's ShellManager watches its shell
  // unconditionally (disableAutoResizing does not reach it) and a pure resize
  // fires no onDidLayoutChange, so there is nothing to hook. Calling
  // api.layout first makes callback ORDER irrelevant — if dockview already
  // laid out, it is a no-op (dockview skips equal dimensions); if not,
  // dockview's own later call is.
  let trackedWidth = width;
  let trackedHeight = height;

  function reapplyExactLayoutOnResize(): void {
    const nextWidth = opts.container.clientWidth;
    const nextHeight = opts.container.clientHeight;

    // Hidden (display: none) collapses to 0×0 — dockview skips it too.
    if (nextWidth === 0 || nextHeight === 0) {
      return;
    }

    if (nextWidth === trackedWidth && nextHeight === trackedHeight) {
      return;
    }

    trackedWidth = nextWidth;
    trackedHeight = nextHeight;

    // Always, so anything after this line sees the grid at its settled size
    // whichever observer ran first.
    api.layout(nextWidth, nextHeight);

    // A user's arrangement is theirs: dockview's proportional resize is the
    // right behaviour for it, so only a pristine grid is corrected. This gate
    // guards the CORRECTION below, not the handler — a step that must follow
    // every resize (see the instance re-share below) belongs OUTSIDE it.
    //
    // Deliberately coarse: ANY pointerdown in the dock ends correction for
    // this mount — a click in an order ticket as much as a sash drag. The
    // correction exists for the settle BEFORE interaction; a later window
    // resize after any click is dockview-proportional again, by design.
    // Widening this to "arrangement-only" pointers would need a reliable way
    // to tell the two apart, which is exactly what origin-by-pointer avoids.
    //
    // Only a SEEDED grid is corrected. A blob restored into a pre-settle
    // container and settled back to the size it was saved at comes out
    // exact on its own — measured: 0 lossy of 2,103 cases (3 widths ×
    // heights 600–1300), where the same sweep found the seed path lossy in
    // 717 — because that is a round trip, while a seed built at 981 is not.
    if (!userArranged && restored.restoreTier === "seed") {
      const exact = convertSeed(opts.seed, nextWidth, nextHeight, {
        gap: GROUP_GAP_PX,
      }).serialized.grid;

      // One serialisation per corrective resize: on a pristine grid a user
      // dragging the window edge runs this every frame.
      const live = api.toJSON().grid;

      if (exact.orientation === live.orientation) {
        alignBranchSizes(
          exact.root,
          live.root,
          axisDividedBy(exact.orientation),
        );
      }
    }

    // Re-share every unpinned chart instance's split after ANY settled
    // resize, deliberately OUTSIDE both gates above: opening a chart
    // instance is itself a pointerdown inside the dock, so it sets
    // userArranged immediately — a hook gated behind "!userArranged" would
    // never run for exactly the engines that hold instances.
    //
    // Scoped to splits OUTSIDE the live maximize's boundary, not "skip while
    // ANY maximize is live": a maximize elsewhere (e.g. a nearest-column
    // maximize of the rail) never touches the instances' own split, so a
    // blanket skip would strand them at a stale share for no reason (R21
    // below). What the exclusion guards against: a split INSIDE the
    // boundary can hold the maximized group itself — a root-maximized
    // instance's row is nothing but strips plus that one live,
    // fully-expanded member. That member must never be run through the
    // ordinary share formula, which treats a lone live member as an
    // instance to be sized down toward its design width — today it happens
    // to be a no-op there only because a maximize's own strip pass always
    // leaves at most one live, static-free member behind, which is an
    // accident of the maximize mechanism, not something this rule should
    // rely on. The maximize-exit path (settleMaximizeShares) is what pays
    // whatever a boundary's own split owes once it restores.
    const boundary = maximized === null ? null : liveMaximizeBoundary();
    const splits = new Set<Element>();

    for (const instanceId of unpinnedDynamicPanels.keys()) {
      const split = instanceSplitOf(instanceId);

      if (split !== null && (boundary === null || !boundary.contains(split))) {
        splits.add(split);
      }
    }

    for (const split of splits) {
      shareSplitAmongInstances(split);
    }
  }

  /** Sets `live`'s children to `exact`'s sizes along `along`, then recurses —
   * outer level first, because resizing a parent proportionally rescales its
   * children (the lossy step again, one level down) and the inner pass then
   * corrects that. A level is sized only when its children match the source
   * one-for-one (same panels, same order). Anything the source did not size —
   * a dynamic panel, a closed leaf's absence — leaves that level to dockview,
   * while matched children below it are still aligned. Groups under a design
   * pin or a strip need no special case: their live min=max constraints win
   * over a set, so a sibling sized against one is clamped back by dockview. */
  function alignBranchSizes(
    exact: GridNode,
    live: GridNode,
    along: DockStripOrientation,
  ): void {
    if (exact.type !== "branch" || live.type !== "branch") {
      return;
    }

    const exactChildren = exact.data as readonly GridNode[];
    const liveChildren = live.data as readonly GridNode[];
    const matched =
      exactChildren.length === liveChildren.length &&
      exactChildren.every((child, index) => {
        const peer = liveChildren[index];

        return peer !== undefined && samePanels(child, peer);
      });

    if (matched) {
      // All but the last: each set redistributes along the axis, and the last
      // child absorbs whatever remains — which is exactly its exact size.
      for (let index = 0; index < exactChildren.length - 1; index += 1) {
        const size = exactChildren[index]?.size;
        const group = firstGroupUnder(liveChildren[index]);

        if (size !== undefined && group !== undefined) {
          axisOf(group, along).set(size);
        }
      }
    }

    const inner = crossAxisOf(along);

    // Recursion needs only STRUCTURE from the live snapshot (sizes are read
    // back from the groups), so it stays valid after the sets above.
    for (const child of exactChildren) {
      const peer = liveChildren.find((candidate) => {
        return samePanels(candidate, child);
      });

      if (peer !== undefined) {
        alignBranchSizes(child, peer, inner);
      }
    }
  }

  function firstGroupUnder(
    node: GridNode | undefined,
  ): SizableGroup | undefined {
    const panelId = node === undefined ? undefined : panelIdsIn(node)[0];

    return panelId === undefined ? undefined : groupOf(panelId);
  }

  // Assumes ResizeObserver exists — safe, dockview's own ShellManager already
  // requires it; jsdom tests stub it (see createDockEngine.test.ts).
  const resizeObserver = new ResizeObserver(() => {
    reapplyExactLayoutOnResize();
  });
  resizeObserver.observe(opts.container);

  return {
    maximizePanel: (panelId: string): void => {
      const panel = api.getPanel(panelId);

      if (
        panel === undefined ||
        maximized?.panelId === panelId ||
        // R2 (Phase 6 design §3.2): a floating group is outside the grid, so
        // a maximize has no space to claim for it and no home to restore it
        // to. Refused here as well as hidden in the head, so the refusal
        // holds for a replay or a stale bridge too.
        !isInGrid(panel.group)
      ) {
        return;
      }

      glide(() => {
        // Switching from another maximized panel: put ITS strips back fully
        // first, so the sizes recorded below are real ones, not the bars.
        const endedBoundary =
          maximized === null ? null : liveMaximizeBoundary();
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

        if (endedBoundary !== null) {
          // A share owed from inside the old maximize is paid on its
          // restored geometry, before the new one records sizes.
          settleMaximizeShares(endedBoundary);
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
          // R7 (Phase 6 design §3.2): DOM containment is NOT grid membership.
          // A float stays inside this engine's own container — dockview
          // mounts it in a `.dv-floating-overlay-host` sibling of the grid
          // (measured, Task 1 Q2) — so `boundary.contains` is TRUE for it and
          // a maximize would otherwise strip a float to a 32px bar. Floats
          // are boxes OVER the grid: they stay visible and untouched.
          if (
            group === panel.group ||
            !isInGrid(group) ||
            !boundary.contains(group.element)
          ) {
            continue;
          }

          for (const sibling of [...group.panels]) {
            if (recordStrip(sibling.id)) {
              stripped.push(sibling.id);
            }
          }
        }

        maximized = { panelId, stripped };

        // R19: a maximize that STRIPS an unpinned instance owes its split a
        // share on exit. It compensates for a known limitation of the strip
        // restore: the pre-strip world ledger (worldAround /
        // directMembersOf / settleStripFreeWorlds) records only the LEAF
        // groups sitting directly in a split, never its branch children (the
        // main column, the rail), so on exit the rail's restore from its bar
        // takes its width out of the last instance (1136 · 290 · 360 · 93
        // instead of 869 · 290 · 360 · 360). Pinned instances masked this —
        // a min=max group cannot absorb. A maximize that strips no instance
        // (e.g. a nearest-column one outside the instances' row) marks
        // nothing, so a width the user dragged survives it.
        // Only an instance whose width-axis split lies inside the boundary:
        // a nearest-column maximize that strips an instance stacked in its
        // column changes that column's heights, not its row's widths.
        for (const strippedId of stripped) {
          const split = unpinnedDynamicPanels.has(strippedId)
            ? instanceSplitOf(strippedId)
            : null;

          if (split !== null && boundary.contains(split)) {
            owedShares.set(strippedId, "maximize");
          }
        }

        // After the strips are recorded (a pinned rail sibling's record
        // captures the pin, then is patched off it) and before settleStrips
        // clamps the bars — whose freed space the maximized group can only
        // absorb once its own pin is lifted. Constraints before sizes.
        suspendedPins = suspendPinsHolding(panelId, boundary);
        settleStrips();
      });
    },
    exitMaximize: (): void => {
      if (maximized === null) {
        return;
      }

      glide(() => {
        const endedBoundary = liveMaximizeBoundary();
        const restores = releaseMaximize();
        // Siblings first (a broken column restores its width), then each
        // panel's own length on its natural axis.
        settleStrips();

        for (const restore of restores) {
          restore();
        }

        settleStripFreeWorlds();
        settleMaximizeShares(endedBoundary);
        // A float docked home under this maximize had its size deferred.
        restoreFloatHomeSizes();
      });
    },
    collapsePanel: (panelId: string): void => {
      const panel = api.getPanel(panelId);

      // R1 (Phase 6 design §3.2): a floating group is outside the grid, so a
      // strip has no slot to build around it and no home to restore it to.
      // An id this engine does not know falls through to the paths below,
      // which have always handled it — only the FLOATING case is new here.
      if (panel !== undefined && !isInGrid(panel.group)) {
        return;
      }

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
      // Read before the release: only a VERTICAL strip reclaimed width, and
      // only the width-axis split it reclaimed along may have its owed
      // shares paid — an unrelated expand (a blotter's height bar) pays none.
      const reclaimedWidthSplit =
        lastStrips[panelId] === "vertical" ? widthSplitAbove(panelId) : null;
      const restore = releaseStrip(panelId);

      if (restore === null) {
        return;
      }

      glide(() => {
        settleStrips();
        restore();
        settleStripFreeWorlds();
        // An expanded panel absorbs again, unlike the strip it just was.
        settlePinAbsorption();

        if (reclaimedWidthSplit !== null) {
          settleOwedShares((_cause, split) => {
            return split === reclaimedWidthSplit;
          });
        }
      });
    },
    addDynamicPanel: insertDynamicPanel,
    removeDynamicPanel: deleteDynamicPanel,
    closePanel: (panelId: string): void => {
      const panel = api.getPanel(panelId);

      if (panel === undefined) {
        return;
      }

      // Closing the maximize owner ends the maximize exactly as an exit does,
      // owed shares included — read its boundary while the owner exists.
      const endedBoundary =
        maximized?.panelId === panelId ? liveMaximizeBoundary() : null;

      glide(() => {
        if (maximized?.panelId === panelId) {
          // Closing the maximized panel exits its maximize first: its
          // forced strips must restore, not stay bars with nothing
          // maximized behind them.
          const restores = releaseMaximize();
          settleStrips();

          for (const restore of restores) {
            restore();
          }

          settleStripFreeWorlds();
        } else if (maximized !== null) {
          // A closing panel cannot stay listed among the maximize's strips.
          maximized = {
            panelId: maximized.panelId,
            stripped: maximized.stripped.filter((id) => {
              return id !== panelId;
            }),
          };
        }

        // A stripped panel's record must not outlive it — release WITHOUT
        // the size-restore step (the panel is leaving; there is nothing to
        // size back).
        releaseStrip(panelId);

        api.removePanel(panel);
        // Siblings re-derive strip orientations and worlds over the new
        // membership (drifted worlds void rather than re-assert).
        settleStrips();
        settleStripFreeWorlds();
        // The panel that just left may have been the last one able to absorb
        // the container's spare space — a pin with no absorber starves the
        // whole grid rather than just itself.
        settlePinAbsorption();

        if (endedBoundary !== null) {
          settleMaximizeShares(endedBoundary);
        }
      });
    },
    reopenPanel: (panelId: string): void => {
      if (api.getPanel(panelId) !== undefined) {
        return;
      }

      const anchor = seedAnchorFor(opts.seed, panelId, (candidateId) => {
        return (
          candidateId !== panelId && api.getPanel(candidateId) !== undefined
        );
      });

      glide(() => {
        api.addPanel({
          id: panelId,
          component: RTC_PANEL_COMPONENT,
          title: opts.panels.title(panelId),
          ...(anchor === null
            ? {}
            : {
                position: {
                  referencePanel: anchor.anchorPanelId,
                  direction: anchor.direction,
                },
              }),
        });
        settleStrips();
        settleStripFreeWorlds();
        // A reopened panel can absorb again — re-clamp any pin suspended
        // while the grid had nothing to trade against it.
        settlePinAbsorption();
      });
    },
    popoutPanel: async (panelId: string): Promise<boolean> => {
      const panel = api.getPanel(panelId);

      if (panel === undefined) {
        return false;
      }

      // Dockview owns the whole transaction — window features, stylesheet
      // copy, DOM movement, dock-home on close. False = popup blocked (or
      // an edge group): the grid is untouched in that case, and jsdom can
      // only ever take this branch (window.open → null).
      return api.addPopoutGroup(panel.group);
    },
    floatPanel: (panelId: string): boolean => {
      const panel = api.getPanel(panelId);

      // R3 (Phase 6 design §3.2): a float while a strip owns the grid has no
      // coherent home to return to, so a live maximize refuses one outright.
      //
      // R8, the same reasoning one panel down: a COLLAPSED panel is a strip
      // member, and a float has no strip — the two states are mutually
      // exclusive by construction, exactly as R1/R2 read it from the other
      // side. Without this, floating a collapsed panel carries the strip's
      // min=max bar clamp into the float: a ~39px box that cannot be resized
      // until the panel is expanded again.
      //
      // Both refusals are mirrored for the shift-drag gesture by
      // cancelRefusedShiftFloat, which is the gesture's only reachable veto
      // point (see that function) and shares this predicate.
      if (
        panel === undefined ||
        maximized !== null ||
        !isInGrid(panel.group) ||
        holdsStrippedPanel(panel.group)
      ) {
        return false;
      }

      // R5 (pin suspension) and Ruling 10 (absorption) run inside this call,
      // from settleFloatTransitions when dockview closes the float mutation —
      // the same path the shift-drag gesture takes, so the two cannot drift.
      api.addFloatingGroup(
        panel.group,
        floatingBoundsFor(
          panel.group,
          opts.container,
          api.groups.filter((group) => {
            return group.api.location.type === "floating";
          }).length,
        ),
      );

      return true;
    },
    dockPanel: (panelId: string): void => {
      const panel = api.getPanel(panelId);

      if (panel === undefined || panel.group.api.location.type !== "floating") {
        return;
      }

      // The seed tree names where this panel belongs; seedAnchorFor (the
      // same helper reopenPanel already uses) resolves it to the nearest
      // GRID-resident seed sibling — restricting "live" to a grid location
      // (Ruling 5) is what covers both halves of Ruling 4 in one predicate:
      // a CLOSED sibling is simply not found by seedPanelIdsOf().find, and a
      // FLOATING one (the anchor's own group "gone" to a float) is excluded
      // the exact same way, so either case falls through to the grid-group
      // fallback below rather than throwing.
      const anchor = seedAnchorFor(opts.seed, panelId, (candidateId) => {
        const candidate = api.getPanel(candidateId);

        return (
          candidateId !== panelId &&
          candidate !== undefined &&
          isInGrid(candidate.group)
        );
      });

      const anchorGroup =
        anchor === null ? undefined : api.getPanel(anchor.anchorPanelId)?.group;

      if (anchor !== null && anchorGroup !== undefined) {
        panel.api.moveTo({
          group: anchorGroup,
          position: directionToPosition(anchor.direction),
        });
      } else {
        // No seed home to return to. Two ways to get here: a DYNAMIC panel (a
        // chart instance) has no seed slot BY CONSTRUCTION — the seed tree
        // never names one — and a static panel whose every seed sibling is
        // itself closed, floating or popped finds no live anchor either.
        // Both dock at the ROOT'S RIGHT EDGE, exactly where
        // insertDynamicPanel opens an instance. That includes an EMPTY grid
        // (every panel of the tab floated): the group then becomes the
        // grid's root, and the panels docked after it find it as their seed
        // anchor. This branch used to be skipped when nothing was
        // grid-resident, leaving Dock a silent no-op — a tab whose every
        // panel floated could never be docked again (user report,
        // 2026-09-19).
        //
        // It has to be the GROUP api's moveTo: given a bare `position` it
        // adds a new root-level group and moves this group into it
        // (dockview-core@8.3.1). The PANEL api's moveTo cannot express that —
        // with no `group` it centres on the panel's OWN group, a no-op — so
        // reaching for a grid group to satisfy it instead tabbed the panel
        // onto whichever group happened to be first, which for an instance is
        // a stack with a static panel, where the R6 share rule never reaches
        // it again.
        panel.group.api.moveTo({ position: "right" });
      }

      // The re-clamp of a pin this float suspended (R5), absorption
      // (Ruling 10) and an instance's re-share (R6) all ran inside the move
      // above, from settleFloatTransitions — the path a drag home takes too.
    },
    groupCount: () => {
      return api.groups.length;
    },
    dispose: () => {
      ownerWindow?.removeEventListener("pagehide", flushPendingSave);
      changeSub.dispose();
      popoutAddSub.dispose();
      popoutRemoveSub.dispose();
      openerRootObserver.disconnect();
      popoutRoots.clear();
      willMutateSub.dispose();
      mutateSub.dispose();
      opts.container.removeEventListener("pointerdown", armSashUnpin, true);
      opts.container.removeEventListener(
        "pointerdown",
        cancelRefusedShiftFloat,
        true,
      );
      opts.container.removeEventListener("pointerdown", markUserArranged, true);
      opts.container.removeEventListener(
        "pointerdown",
        moveFloatFromHead,
        true,
      );
      opts.container.removeEventListener("dragstart", cancelHeadTabDrag, true);
      window.removeEventListener("pointerup", endFloatHeadMove, true);
      window.removeEventListener("pointercancel", endFloatHeadMove, true);
      resizeObserver.disconnect();
      disarmSashUnpin();

      if (glideTimer !== null) {
        clearTimeout(glideTimer);
        glideTimer = null;
        opts.container.removeAttribute(DOCK_GLIDE_ATTRIBUTE);
      }

      // The last USER arrangement must survive dispose. Dockview's model
      // updates synchronously (only its onDidLayoutChange notification is
      // microtask-deferred, via AsapEvent), so a user's mutation right before
      // dispose — e.g. clicking maximize just ahead of navigating away — would
      // otherwise be lost: cancel any pending debounce and flush one final
      // serialisation rather than only when a timer happens to be pending.
      //
      // …but ONLY if a user was here (see userArranged). An untouched engine's
      // grid is a pure function of its options, so flushing it persists
      // nothing the next construction can't rebuild — and it is actively
      // harmful: the container may not have settled yet. StrictMode's
      // synchronous double mount disposes engine #1 while an eager mount still
      // sees the pre-settle 981px container; flushing then hands engine #2 a
      // 981px blob, which dockview proportionally rescales into 980px and
      // loses a pixel on the tiles/blotter sash (measured, app/fx-dockview).
      // Skipping lets #2 seed exactly. The flush stays on onLayoutChange so a
      // bridge's reset-suppression guard still sees it.
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }

      if (userArranged) {
        serializeLayout();
      }

      api.dispose();
    },
  };
}

/** The float's opening box: it POPS OUT of the grid rather than detaching
 * in place — never larger than the panel was, at most half the dock in each
 * direction, centred on the dock, and stepped down-right by
 * `FLOAT_CASCADE_PX` per float already open so a second float never lands
 * exactly on the first. Detaching in place (the first cut) left the float
 * covering exactly the slot it came from, so floating a panel looked like
 * nothing had happened.
 *
 * Clamped so it lands fully inside `container` — "a float cannot be dragged
 * out of reach" (Phase 6 design §3.3) applies to where it OPENS, not only to
 * where a drag can carry it afterwards (that ongoing clamp is the
 * component-level `floatingGroupBounds` option). */
function floatingBoundsFor(
  group: SizableGroup,
  container: HTMLElement,
  openFloats: number,
): FloatingGroupOptions {
  const groupRect = group.element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const width = Math.round(
    Math.min(
      groupRect.width,
      Math.max(FLOAT_MIN_WIDTH_PX, containerRect.width * FLOAT_MAX_SHARE),
    ),
  );

  const height = Math.round(
    Math.min(
      groupRect.height,
      Math.max(FLOAT_MIN_HEIGHT_PX, containerRect.height * FLOAT_MAX_SHARE),
    ),
  );
  const maxX = Math.max(0, containerRect.width - width);
  const maxY = Math.max(0, containerRect.height - height);
  const cascade = openFloats * FLOAT_CASCADE_PX;

  return {
    x: Math.round(
      Math.min(Math.max((containerRect.width - width) / 2 + cascade, 0), maxX),
    ),
    y: Math.round(
      Math.min(
        Math.max((containerRect.height - height) / 2 + cascade, 0),
        maxY,
      ),
    ),
    width,
    height,
  };
}

/** A popped-out float's share of the dock, per axis, at most. */
const FLOAT_MAX_SHARE = 0.5;
/** Floors under that share, so a float on a small dock stays usable. The
 * panel's own size still wins when it is smaller. */
const FLOAT_MIN_WIDTH_PX = 420;
const FLOAT_MIN_HEIGHT_PX = 280;
/** How far each further float opens down-right of the previous one. */
const FLOAT_CASCADE_PX = 28;

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

/** Why a width-axis split owes a share — which actions may pay it. See the
 * engine's `owedShares`. */
type OwedShareCause = "maximize" | "retained";

/** Whether `split` lays its children side by side — a WIDTH-axis split, the
 * only kind the sharing rule acts on. */
function sharesWidth(split: Element): boolean {
  return orientationAgainst(split) === "vertical";
}

/** An instance member the sharing rule sizes: the along-split axis of every
 * group in it (one for a lone instance, several for a stacked column), and
 * its design width as a MODEL size (card + gap). */
interface SharedInstance {
  readonly axes: readonly GroupAxis[];
  readonly designModel: number;
}

/** A live design pin: the persisted description, its members' pre-pin
 * constraints, and the split whose sash releases it. */
interface DesignPinRecord {
  readonly pin: DockDesignPin;
  readonly members: readonly PinMember[];
  readonly ownerSplit: Element;
}

/** Overwrites the constraints a strip record will restore on `orientation`'s
 * axis — its natural pair when that is the strip's natural axis, else the
 * orthogonal pair. How a pin reaches a panel while it is a strip. */
function patchStripAxis(
  strip: StripRecord,
  orientation: DockStripOrientation,
  minimum: number,
  maximum: number,
): void {
  if (orientation === strip.natural) {
    strip.minimum = minimum;
    strip.maximum = maximum;
  } else {
    strip.orthogonalMinimum = minimum;
    strip.orthogonalMaximum = maximum;
  }
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

/** The direct child view of `owner` (a split-view container) that holds
 * `element` — the "rail" a pinned panel lives in. Null when `element` is
 * not under `owner` at all. */
function railViewOf(element: Element, owner: Element): Element | null {
  let view: Element | null = element.closest(VIEW_SELECTOR);

  while (
    view !== null &&
    (view.parentElement?.closest(SPLIT_SELECTOR) ?? null) !== owner
  ) {
    view = view.parentElement?.closest(VIEW_SELECTOR) ?? null;
  }

  return view;
}

/** `record`'s declaring split AS THE LIVE DOM HAS IT, or null once the pin no
 * longer describes reality: its panels must exactly fill their groups AND
 * those groups must still share ONE rail (one direct child view of that
 * split). Exact-fill alone passes VACUOUSLY after a drag ejects a member into
 * its own group — both fragments then hold only pinned panels (audit S2) — so
 * the rail identity is the real invariant.
 *
 * Returns the split rather than a boolean because, for a record whose own
 * `ownerSplit` may be stale, the re-derivation that answers "is this pin
 * still real?" is exactly the value to store back — which is why this walk
 * has one spelling (a second one is how a stale split survived a reload once
 * already). Today only `clampPinsFloatSuspendedFor` stores it: its records
 * were suspended outside the grid, so their split is known-wrong.
 * `intactDesignPins` and `releaseMaximize` use it as a predicate only and
 * keep the record's existing split — a deliberate, pre-6a behaviour on paths
 * whose members never left the grid (tracked in docs/STATUS.md). */
function intactPinOwnerSplit(
  record: DesignPinRecord,
  groupOf: (panelId: string) => SizableGroup | undefined,
): Element | null {
  if (!panelsExactlyFill(record.pin.panelIds, groupOf)) {
    return null;
  }

  const first = groupOf(record.pin.panelIds[0] ?? "");

  if (first === undefined) {
    return null;
  }

  const owner = declaringSplitOf(first.element, record.pin.axis);

  if (owner === null) {
    return null;
  }

  const rail = railViewOf(first.element, owner);

  if (rail === null) {
    return null;
  }

  const shared = record.pin.panelIds.every((panelId) => {
    const group = groupOf(panelId);

    return group !== undefined && railViewOf(group.element, owner) === rail;
  });

  return shared ? owner : null;
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

/** dockview's per-group drop acceptance: `"no-drop-target"` makes the
 * group's handleDropEvent bail before showing any overlay — the S1
 * strip-drop rejection — and toggles the `dv-locked-groupview` class.
 * Derived from strip membership, NEVER persisted (see serializeLayout's
 * scrub). */
type DockLockState = boolean | "no-drop-target";

interface SizableGroupApi {
  readonly width: number;
  readonly height: number;
  /** Where the group actually lives. Optional because this narrowed view is
   * also satisfied by test doubles that do not model it; `isInGrid` treats an
   * absent location as `"grid"`. */
  readonly location?: { readonly type: string };
  locked: DockLockState;
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
const VIEW_SELECTOR = ".dv-view";
/** The two elements dockview 8.3.1 starts its shift-drag-to-float gesture
 * from — a tab, and the tab bar's void container — each through its own
 * `pointerdown` listener. See `cancelRefusedShiftFloat`. */
const FLOAT_GESTURE_SELECTOR = ".dv-tab, .dv-void-container";
/** A group's whole head bar — the tab strip plus the actions slots. */
const HEAD_BAR_SELECTOR = ".dv-tabs-and-actions-container";
/** dockview's move target for a float under `floatingGroupDragHandle:
 * "tabbar"`. See `moveFloatFromHead`. */
const VOID_CONTAINER_SELECTOR = ".dv-void-container";
/** What on a head keeps its own meaning when pressed on a float, rather than
 * moving it. Deliberately not `[role=tab]`: dockview's `.dv-tab` wraps the
 * WHOLE in-house head, so matching it would exclude every press. */
const HEAD_CONTROL_SELECTOR =
  "button, a, input, select, textarea, [contenteditable], [role='button'], [role='menuitem']";

/** Which way a strip reads when its space reclaims along `split`'s axis:
 * siblings side by side (a horizontal split) → a 32px vertical column;
 * siblings stacked (a vertical split) → a 32px horizontal bar. */
function orientationAgainst(split: Element): DockStripOrientation {
  return split.classList.contains("dv-vertical") ? "horizontal" : "vertical";
}

function opposite(orientation: DockStripOrientation): DockStripOrientation {
  return orientation === "vertical" ? "horizontal" : "vertical";
}

/** The MODEL size a strip's group is clamped to: the 32px visible bar plus
 * the view's own gutter inset (model = card + gap, as everywhere). */
function barModelFor(orientation: DockStripOrientation): number {
  return (
    (orientation === "vertical" ? STRIP_WIDTH_PX : STRIP_HEIGHT_PX) +
    GROUP_GAP_PX
  );
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

/** Gives a flipped split's strips an equal share of its length — measured
 * as their model sizes now (which sum back to the split), settled one by
 * one. */
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
    axisOf(group, along).set(share);
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

/** Pins a group at exactly `size` (a MODEL size) along `axis`: constraints
 * and size together — a bare setSize would leave the group draggable back
 * open, and a sibling's resize could push it wide again. With no theme gap
 * the model is the render, so there is nothing to measure back or correct:
 * the gap-7 era's set-and-measure double-pass (`setRendered` /
 * `clampRendered`) is gone with the shave that made it necessary. */
function clampTo(axis: GroupAxis, size: number): void {
  axis.constrain(size, size);
  axis.set(size);
}

/** Which rung of `loadBlobOrSeed`'s retry ladder actually produced the
 * restored layout, cheapest loss first:
 * - `"blob"` — the whole saved blob restored as-is, floats included.
 * - `"blob-without-floats"` — an unrestorable `floatingGroups` entry was
 *   dropped and the rest of the blob (the whole grid) restored; the float's
 *   own panels fall to whatever re-seeds them below.
 * - `"blob-without-dynamic"` — every non-static (Jarvis-docked) leaf was
 *   scrubbed from the grid and the STATIC arrangement restored; see
 *   {@link withoutDynamicNodes}.
 * - `"seed"` — nothing of the blob survived; the seed tree was converted
 *   fresh. This is the case a settle resize must correct — see
 *   reapplyExactLayoutOnResize — because a seed conversion is not a round
 *   trip the way restoring an already-settled blob is.
 *
 * The ladder is CUMULATIVE — each rung retries on the OUTPUT of the rung
 * above it, never the original blob — so a blob damaged in two ways at once
 * (e.g. an unrestorable float AND an unrestorable dynamic leaf) reports the
 * LAST and most severe scrub actually needed, `"blob-without-dynamic"`, not
 * a fourth combined label: the tier's own name already implies every scrub
 * ABOVE it in this list was applied too, because the ladder only reaches a
 * rung by falling through every rung before it. */
export type RestoreTier =
  | "blob"
  | "blob-without-floats"
  | "blob-without-dynamic"
  | "seed";

/** What a load hands the engine beyond the grid dockview restored: the
 * design pins to apply, and the strip-geometry seeds a re-applied collapse
 * consumes (empty on a seed load or a legacy blob). */
interface RestoredLayout {
  readonly pins: readonly DockDesignPin[];
  /** Each persisted strip's pre-collapse size, by panel id. */
  readonly stripSizes: ReadonlyMap<string, number>;
  /** Each persisted flipped split's pre-flip size, by {@link flipKeyFor}. */
  readonly flipSizes: ReadonlyMap<string, number>;
  /** Each persisted float's pre-float home extent, by panel id (empty on a
   * seed load or a blob saved with no float remembering one). */
  readonly floatSizes: ReadonlyMap<string, FloatHomeSize>;
  /** Which retry tier actually restored this layout — see {@link RestoreTier}. */
  readonly restoreTier: RestoreTier;
}

type SerializedGrid = SerializedDockview["grid"];

/** One node of a serialized grid — a branch's `data` is its children. */
type GridNode = SerializedGrid["root"];

/** The part of a serialized leaf's `data` the grid walk reads. */
interface LeafData {
  readonly views?: readonly string[];
}

/** Every panel id under a serialized grid node, in order. */
function panelIdsIn(node: GridNode): readonly string[] {
  if (node.type === "leaf") {
    return (node.data as LeafData).views ?? [];
  }

  return (node.data as readonly GridNode[]).flatMap(panelIdsIn);
}

/** Whether two serialized nodes hold the same panels in the same order —
 * how a source's node is matched to the live one it describes. */
function samePanels(a: GridNode, b: GridNode): boolean {
  const left = panelIdsIn(a);
  const right = panelIdsIn(b);

  return (
    left.length === right.length &&
    left.every((panelId, index) => {
      return right[index] === panelId;
    })
  );
}

/** The {@link axisOf} name for the extent a grid of `orientation` divides at
 * its root: a HORIZONTAL grid lays children side by side (widths). */
function axisDividedBy(orientation: string): DockStripOrientation {
  return orientation === "HORIZONTAL" ? "vertical" : "horizontal";
}

/** Grid branches alternate orientation, so a child branch divides the other
 * extent. */
function crossAxisOf(along: DockStripOrientation): DockStripOrientation {
  return along === "vertical" ? "horizontal" : "vertical";
}

/** Lock state is derived (strip membership), never trusted from a blob: a
 * legacy or hand-edited blob may still carry `locked`, and dockview's
 * fromJSON restores it verbatim. Normalise after every successful restore
 * tier; the bridge's collapse replay re-locks the bars. */
function resetDerivedLocks(api: DockviewApi): void {
  for (const group of api.groups) {
    group.api.locked = false;
  }
}

/** Restores the persisted blob, falling back to the seed tree on ANY failure —
 * a stale or corrupt blob must never brick the workspace. Tries, in order,
 * cheapest loss first: the whole blob; the blob with `floatingGroups`
 * dropped (a damaged float costs only the float); the blob with every
 * dynamic leaf scrubbed (a damaged Jarvis dock costs only its own panels);
 * the seed. The ladder is CUMULATIVE: the dynamic-leaf scrub retries on the
 * FLOATS-ALREADY-DROPPED blob, not the original — a blob damaged in both
 * ways at once must still cost only those two things, not the whole desk
 * (see {@link RestoreTier}'s doc comment for the labelling rule this
 * implies). Exported so the tier a given blob actually lands on is a real,
 * reachable assertion rather than a private read. Returns the design pins
 * to apply — the blob's own surviving `rtcDesignPins` (a legacy blob
 * without the field gets none — that layout may be user-shaped already),
 * or the freshly converted seed's — plus the blob's strip-geometry seeds. */
export function loadBlobOrSeed(
  api: DockviewApi,
  opts: DockEngineOptions,
  width: number,
  height: number,
): RestoredLayout {
  if (opts.blob !== null) {
    try {
      // A gap-7-era blob (no rtcBlobVersion) is lifted into the gap-0 model
      // first — grid sizes and strip-sidecar sizes change units; see
      // migrateDockBlob. dockview's fromJSON reads only the fields it
      // knows, so the pin, strip-geometry and floating-group sidecars ride
      // through untouched.
      const parsed = migrateDockBlob(JSON.parse(opts.blob), GROUP_GAP_PX);
      api.fromJSON(parsed as Parameters<DockviewApi["fromJSON"]>[0]);
      resetDerivedLocks(api);

      return {
        pins: designPinsIn(parsed),
        ...stripGeometryIn(parsed),
        floatSizes: floatSizesIn(parsed),
        restoreTier: "blob",
      };
    } catch {
      // A `floatingGroups` entry can go unrestorable on its own — a stale
      // or hand-edited shape the app never wrote itself — without the rest
      // of the DOCKED arrangement being at fault. Floats are the cheaper
      // thing to lose (design §3.3 persists them, but nothing else depends
      // on one surviving), so this retries BEFORE the dynamic-node scrub
      // below: dropping `floatingGroups` outright and re-parsing.
      //
      // `floatless` is computed ONCE here and handed down to the
      // dynamic-node scrub too, rather than each rung re-deriving from
      // `opts.blob` — that is the difference between a cumulative ladder
      // and a non-cumulative one: without it, a blob damaged in BOTH ways
      // would have its dynamic-leaf retry re-parse the STILL-broken
      // `floatingGroups` entry, throw again, and fall all the way to the
      // seed, reseeding the user's whole desk over a float that was never
      // the dynamic scrub's problem to fix. `null` means `opts.blob` itself
      // was not even parseable JSON, in which case nothing below can help
      // either.
      let floatless: string | null;

      try {
        floatless = JSON.stringify(
          withoutFloatingGroups(JSON.parse(opts.blob)),
        );
      } catch {
        floatless = null;
      }

      if (floatless !== null) {
        try {
          const parsed = migrateDockBlob(JSON.parse(floatless), GROUP_GAP_PX);
          api.fromJSON(parsed as Parameters<DockviewApi["fromJSON"]>[0]);
          resetDerivedLocks(api);

          return {
            pins: designPinsIn(parsed),
            ...stripGeometryIn(parsed),
            floatSizes: floatSizesIn(parsed),
            restoreTier: "blob-without-floats",
          };
        } catch {
          // Dropping the float alone did not fix it either — either the
          // float was fine and something in the GRID is unrestorable, or
          // there was no `floatingGroups` to drop at all and this is the
          // identical failure caught above. One dynamic (Jarvis-docked)
          // panel's node can go unrestorable on its own without the rest of
          // the arrangement being at fault; retry once with every
          // non-static leaf scrubbed out of `floatless` — NOT `opts.blob` —
          // so a float already known to be unrestorable does not resurrect
          // itself on this retry and fail it too. A static-only blob (or
          // one this can't safely operate on) hands back `null` and falls
          // straight through to the seed below, same as before.
          const scrubbed = withoutDynamicNodes(
            floatless,
            seedPanelIdsOf(opts.seed),
          );

          if (scrubbed !== null) {
            try {
              const parsed = migrateDockBlob(
                JSON.parse(scrubbed),
                GROUP_GAP_PX,
              );
              api.fromJSON(parsed as Parameters<DockviewApi["fromJSON"]>[0]);
              resetDerivedLocks(api);

              return {
                pins: designPinsIn(parsed),
                ...stripGeometryIn(parsed),
                floatSizes: floatSizesIn(parsed),
                restoreTier: "blob-without-dynamic",
              };
            } catch {
              // fall through to the seed
            }
          }
        }
      }
    }
  }

  const { serialized, pins } = convertSeed(opts.seed, width, height, {
    gap: GROUP_GAP_PX,
  });
  api.fromJSON(serialized);

  return {
    pins,
    stripSizes: new Map(),
    flipSizes: new Map(),
    floatSizes: new Map(),
    restoreTier: "seed",
  };
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

/** A panel's extent along its parent split's dividing axis, named the way
 * {@link axisOf} names axes (`"vertical"` = the width axis). */
interface FloatHomeSize {
  readonly along: DockStripOrientation;
  readonly size: number;
}

/** One float's persisted home extent — the axis spelled as a dimension, like
 * a design pin's, so the wire format does not leak the strip vocabulary. */
interface PersistedFloatSize {
  readonly axis: "width" | "height";
  readonly size: number;
}

/** A blob that MAY carry the float-size sidecar, unverified. */
interface FloatSizeSidecarCarrier {
  readonly rtcFloatSizes?: unknown;
}

/** One unverified entry of the float-size sidecar. */
interface UnverifiedFloatSize {
  readonly axis?: unknown;
  readonly size?: unknown;
}

/** The `rtcFloatSizes` sidecar of a parsed blob, dropping anything malformed
 * — like the strip geometry, it crosses localStorage. Whether each entry's
 * panel really came back floating is the engine's check, not this one's. */
function floatSizesIn(parsed: unknown): ReadonlyMap<string, FloatHomeSize> {
  const sizes = new Map<string, FloatHomeSize>();

  if (typeof parsed !== "object" || parsed === null) {
    return sizes;
  }

  const raw = (parsed as FloatSizeSidecarCarrier).rtcFloatSizes;

  if (typeof raw !== "object" || raw === null) {
    return sizes;
  }

  for (const [panelId, entry] of Object.entries(raw)) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }

    const { axis, size } = entry as UnverifiedFloatSize;

    if ((axis === "width" || axis === "height") && isUsableSize(size)) {
      sizes.set(panelId, {
        along: axis === "width" ? "vertical" : "horizontal",
        size,
      });
    }
  }

  return sizes;
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

/** Where a reopened panel goes: addPanel relative to the anchor panel's
 * group, in the seed-derived direction. */
export interface SeedAnchor {
  readonly anchorPanelId: string;
  readonly direction: "left" | "right" | "above" | "below";
}

/** One ancestor split on the closed panel's seed path, with the child index
 * the panel descends through — the outward-walk unit of seedAnchorFor. */
interface SeedPathLevel {
  readonly split: SeedSplit;
  readonly index: number;
}

/** One step of {@link seedAnchorFor}'s walk: where `panelId` sits inside
 * `node`, as the child index path (innermost last). Null when absent. */
function seedPathTo(
  node: DockSeedNode,
  panelId: string,
): readonly number[] | null {
  if (node.kind === "panel") {
    return node.panelId === panelId ? [] : null;
  }

  for (const [index, child] of node.children.entries()) {
    const rest = seedPathTo(child, panelId);

    if (rest !== null) {
      return [index, ...rest];
    }
  }

  return null;
}

/** The reopen-position rule, pure over the SEED tree: find `panelId`'s seed
 * position, then take sibling subtrees in order of proximity — nearest
 * sibling of its own split first, then outward through ancestor splits —
 * and anchor at the first one holding a live panel. The direction reads off
 * the deciding split's `dir` and the index relation (a row's later child
 * reopens to the anchor's "right", etc.). Null when no seed panel is live —
 * the caller falls back to adding at the grid edge. */
export function seedAnchorFor(
  seed: DockSeedNode,
  panelId: string,
  isLive: (candidateId: string) => boolean,
): SeedAnchor | null {
  const path = seedPathTo(seed, panelId);

  if (path === null || seed.kind === "panel") {
    return null;
  }

  // The splits along the path, innermost first, each with the child index
  // the closed panel descends through.
  const levels: SeedPathLevel[] = [];
  let node: DockSeedNode = seed;

  for (const index of path) {
    if (node.kind !== "split") {
      break;
    }

    levels.unshift({ split: node, index });
    node = node.children[index];
  }

  for (const { split, index } of levels) {
    const siblings = split.children
      .map((child, childIndex) => {
        return { child, childIndex };
      })
      .filter(({ childIndex }) => {
        return childIndex !== index;
      })
      .sort((a, b) => {
        return Math.abs(a.childIndex - index) - Math.abs(b.childIndex - index);
      });

    for (const { child, childIndex } of siblings) {
      const live = seedPanelIdsOf(child).find(isLive);

      if (live === undefined) {
        continue;
      }

      const after = index > childIndex;
      const direction =
        split.dir === "row"
          ? after
            ? ("right" as const)
            : ("left" as const)
          : after
            ? ("below" as const)
            : ("above" as const);

      return { anchorPanelId: live, direction };
    }
  }

  return null;
}
