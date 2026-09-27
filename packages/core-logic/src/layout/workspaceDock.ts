/**
 * The workspace's dock bridges and their bookkeeping — synchronous,
 * rxjs-free, and shared by every application core (pluggable-core slice 7).
 * Moved verbatim out of `createApp`'s closure: the RxJS core and both sibling
 * cores wire the SAME rules to their own panels machine, layout machines and
 * active-tab mirror, and keep only the streams around them
 * (`dockedPanelIdsFor`, `workspaceLayoutResets$`, the debounced writer).
 *
 * Every dependency is a synchronous callback. Two of them carry an ordering
 * contract the rules below rely on:
 * - `panels.current()` must already reflect a `panels.dock`/`undock` call by
 *   the time that call returns (every core's panels state is a synchronous
 *   fold), which is how `dockPanel` tells an accepted dock from a rejected
 *   one;
 * - `layoutFor(tab)` must call `recordLayoutState(tab, state)` with the new
 *   machine's current state BEFORE it returns, the first time it creates a
 *   tab's machine — `layoutStateNow` and `resetWorkspaceLayout` read the
 *   recorded set.
 */

import type {
  DockLayoutStore,
  LayoutIntents,
  LayoutNode,
  LayoutState,
  Machine,
  PanelInstance,
  WorkspaceTab,
} from "@rtc/core-api";

import { createDefaultLayoutPort } from "./defaultLayoutPort";
import { isPanelInstanceId } from "./panelInstances";
import { parseWorkspaceLayout } from "./workspaceLayoutPersistence";
import type { DockedPanelPlacement } from "./workspaceLayoutWrite";

/** Every `PanelId` reachable in one layout tree, walked from its root — a
 * `"panel"` leaf contributes its own id, a `"split"` node contributes its
 * children's. Pure and static (the default trees never change at runtime),
 * so `LAYOUT_PANEL_IDS` below computes this once per tab at module load
 * rather than per `JarvisDriverMachine` call. */
function collectPanelIds(node: LayoutNode): readonly string[] {
  if (node.kind === "panel") {
    return [node.panelId];
  }

  return node.children.flatMap(collectPanelIds);
}

export const WORKSPACE_TABS: readonly WorkspaceTab[] = [
  "fx",
  "credit",
  "equities",
  "admin",
];

/** `JarvisDriverMachine`'s `knownLayoutPanelIds` dep source: the static panel
 * ids in each tab's DEFAULT layout tree (e.g. "fx-rates", "eq-chart") — the
 * `"layout"` DriveCommand's membership check. Deliberately the tree's
 * default shape, not whatever a live per-mount layout machine's current
 * `root` happens to be (panel ids never move between tabs at runtime, so the
 * default tree's id set is exactly the live set too). Also used by the
 * client-core conformance test to verify DESK_PANEL_ROSTER against the
 * real layout trees. */
export const LAYOUT_PANEL_IDS: Readonly<
  Record<WorkspaceTab, readonly string[]>
> = Object.fromEntries(
  WORKSPACE_TABS.map((tab) => {
    return [tab, collectPanelIds(createDefaultLayoutPort(tab).initial.root)];
  }),
) as Readonly<Record<WorkspaceTab, readonly string[]>>;

/**
 * Union of every static panel id across ALL FOUR tabs' default layout trees
 * — `dockPanel`'s id-collision guard reads this, not just the active tab's
 * slice of `LAYOUT_PANEL_IDS`. Reason for the union rather than a per-tab
 * check: `App.tsx`'s registry/spec/head merge
 * (`{...appPanelRegistry, ...dockedRegistryFor(dockedPanels, ...)}`) is
 * GLOBAL — one `PanelId → renderer` map shared by every tab's
 * `InhouseLayoutEngine` — so a wire-minted "fx-rates" panel would shadow
 * Live Rates' body/head/title in `credit`/`equities`/`admin` too, not only
 * in `fx`. A wire-minted panelId only needs to collide with SOME tab's
 * static roster to poison all of them.
 */
export const STATIC_WORKSPACE_PANEL_IDS: ReadonlySet<string> = new Set(
  WORKSPACE_TABS.flatMap((tab) => {
    return LAYOUT_PANEL_IDS[tab];
  }),
);

/** The desk-panels machine as the dock bridges drive it. */
export interface WorkspaceDockPanels {
  /** The roster right now — see the module doc's ordering contract. */
  current(): readonly PanelInstance[];
  dock(panelId: string): void;
  undock(panelId: string): void;
  /** The RAW dismissal (roster only). */
  dismiss(panelId: string): void;
  restore(panelId: string, spec: NonNullable<PanelInstance["spec"]>): void;
}

export interface WorkspaceDockDeps {
  readonly panels: WorkspaceDockPanels;
  /** The per-tab layout singleton — see the module doc's ordering contract. */
  readonly layoutFor: (
    tab: WorkspaceTab,
  ) => Machine<LayoutState, LayoutIntents>;
  /** The tab on screen now. */
  readonly activeTab: () => WorkspaceTab;
  /** The stored `workspaceLayout` preference, read once at construction. */
  readonly readStoredLayout: () => string | null;
  /** Clear the stored `workspaceLayout` preference (Reset). */
  readonly clearStoredLayout: () => void;
  readonly dockLayoutStore: DockLayoutStore;
  /** Called after EVERY change to which tab a docked panel belongs to — the
   * core's `dockedPanelIdsFor` stream re-reads membership on it. */
  readonly onDockedMembershipChange: () => void;
  /** Bump the core's `workspaceLayoutResets$` (the LAST step of a reset). */
  readonly onResetsBump: () => void;
}

export interface WorkspaceDock {
  /** `Presenters.dockPanel`. `true` only when THIS call docked the panel —
   * the Jarvis driver reports a `false` as a refused dock. */
  dockPanel(panelId: string): boolean;
  /** `Presenters.undockPanel`. */
  undockPanel(panelId: string): void;
  /** `Presenters.dismissPanel` — the docked-safe dismissal. */
  dismissPanel(panelId: string): void;
  /** `Presenters.resetWorkspaceLayout`. */
  resetWorkspaceLayout(): void;
  /** Rehydrate every docked panel the stored payload holds. Boot-time only,
   * and only for a core whose panels machine is live. */
  restorePersistedDocks(): void;
  /** The ids in `panels` docked into `tab` (dock-time attribution), in
   * roster order. */
  dockedIdsIn(tab: WorkspaceTab, panels: readonly PanelInstance[]): string[];
  /** `dockedIdsIn(tab, panels.current())`. */
  dockedPanelIdsNow(tab: WorkspaceTab): readonly string[];
  /** The tab's current layout state, creating its machine if need be. */
  layoutStateNow(tab: WorkspaceTab): LayoutState;
  /** The persisted tree a first-opened tab's machine seeds from. */
  seedFor(tab: WorkspaceTab): LayoutState | undefined;
  /** Record a created layout machine's latest state. */
  recordLayoutState(tab: WorkspaceTab, state: LayoutState): void;
  /** The writer's "modify" set: every tab whose machine exists. */
  createdLayouts(): ReadonlyMap<WorkspaceTab, LayoutState>;
  /** The writer's docked entries. */
  dockedPlacements(): readonly DockedPanelPlacement[];
  /** `AppCommands.reportDetachedPanels`. */
  reportDetachedPanels(tab: WorkspaceTab, panelIds: readonly string[]): void;
  /** The driver's `detachedPanelIds` dep. */
  detachedPanelIds(tab: WorkspaceTab): readonly string[];
}

export function createWorkspaceDock(deps: WorkspaceDockDeps): WorkspaceDock {
  // The persisted workspace, read ONCE synchronously here — before the first
  // `layoutFor(tab)` call, which is the only moment a layout machine can be
  // seeded (see `LayoutMachineOptions.seedState`). `parseWorkspaceLayout` is
  // fail-closed on the WHOLE payload — a non-null result can be replayed
  // blindly: every tab in it is internally consistent, its docked entries
  // reconcile with its tree, and the global docked total is within the cap.
  //
  // MUTABLE, and it matters: `layoutFor` is lazy, so this seed is consulted
  // again every time a tab is opened for the FIRST time — which can be long
  // after boot, and after a `resetWorkspaceLayout()`. Left `const`, Reset
  // would clear the preference and the machines that happen to exist, then
  // the next never-opened tab would seed straight back out of this stale
  // snapshot and resurrect the pre-reset tree (docked leaves included), which
  // the next debounced write would re-persist. `resetWorkspaceLayout` nulls
  // it for exactly that reason.
  let persistedWorkspace = parseWorkspaceLayout(deps.readStoredLayout());

  /** Which tab each docked panel belongs to — seeded from the persisted
   * payload at boot and updated on every dock/undock. This is the rule the
   * writer persists by: a docked panel lands under the tab that was ACTIVE
   * when it was docked, not under whichever tab is showing when the write
   * finally fires. */
  const dockedPanelTabs = new Map<string, WorkspaceTab>();

  /** Current `LayoutState` of every tab whose machine has been CREATED — the
   * writer's "modify" set. A tab absent here was never opened this session,
   * so its persisted entry is left exactly as stored. */
  const latestLayoutStates = new Map<WorkspaceTab, LayoutState>();

  /** Session-only registry of the panels per tab that currently live OUTSIDE
   * the grid (floating / popped out) — written WHOLE-SET by the Dockview
   * bridge through `commands.reportDetachedPanels`, read synchronously by the
   * driver's `detachedPanelIds` per `layout` command. Never persisted and
   * never part of `LayoutState`: floats/pop-outs are engine-owned "layer 3". */
  const detachedPanelIdsByTab = new Map<WorkspaceTab, readonly string[]>();

  function isPanelDocked(panelId: string): boolean {
    return deps.panels.current().some((panel) => {
      return panel.panelId === panelId && panel.docked;
    });
  }

  /** Dock intent bridge — see `Presenters.dockPanel`'s doc. The panels
   * machine goes FIRST because it owns every no-op rule (unknown id, already
   * docked, `MAX_DOCKED_PANELS` reached); the layout mutation only follows
   * when that call genuinely changed the docked set, so a rejected dock can
   * never leave an orphan leaf behind in the tree.
   *
   * ID-COLLISION GUARD (first check, before either machine is touched): a
   * panelId arriving off the wire is validated by `JarvisPanelsMachine` only
   * for length, so nothing stops the brain from minting one that collides
   * with a STATIC workspace panel id (e.g. "fx-rates"). Docking such an id
   * would be doubly destructive:
   *   1. `App.tsx` spreads the docked-registry helpers LAST over
   *      `appPanelRegistry`/`PANEL_SPECS`/`appHeadRegistry`
   *      (`{...appPanelRegistry, ...dockedRegistryFor(...)}`), so the docked
   *      entry would silently REPLACE the static panel's body/head/title —
   *      see `STATIC_WORKSPACE_PANEL_IDS`'s doc for why this reaches every
   *      tab, not just the one being docked into.
   *   2. `parseWorkspaceLayout`'s reconciliation classifies each dock-column
   *      leaf by static-id membership; a docked leaf carrying a static id
   *      does not reconcile as a docked leaf, so the whole payload is
   *      rejected — silently killing persistence for the rest of the
   *      session (every later write would be validated against, and fail,
   *      the same parser on reload).
   * Guarding here — before either machine is touched — keeps the panel
   * genuinely undocked and the tree untouched, so persistence stays healthy.
   *
   * The guard also refuses the chart-instance NAMESPACE (`isPanelInstanceId`,
   * derived from `instanceIdFor` — every `eq-chart:<symbol>` id): a docked
   * panel sharing an id with an open (or later opened) chart instance would
   * put ONE engine panel under two owners — the Dockview bridge's docked and
   * instance diff effects would add/remove it against each other, and the
   * registry merge would let one shadow the other's body. Refusing the whole
   * prefix, not just ids open right now, keeps a later `openInstance` from
   * colliding with an earlier dock.
   *
   * Returns whether THIS call docked the panel. The Jarvis driver's
   * `dockPanel` case pre-checks only membership, already-docked and the cap,
   * so it has no view of this guard; a `false` here is how it tells the user
   * the dock was refused rather than reporting it applied (pluggable-core
   * slice 7 wave 2, ruling 6). */
  function dockPanel(panelId: string): boolean {
    if (STATIC_WORKSPACE_PANEL_IDS.has(panelId) || isPanelInstanceId(panelId)) {
      return false;
    }

    if (isPanelDocked(panelId)) {
      return false;
    }

    deps.panels.dock(panelId);

    if (!isPanelDocked(panelId)) {
      return false;
    }

    const tab = deps.activeTab();
    dockedPanelTabs.set(panelId, tab);
    deps.onDockedMembershipChange();
    deps.layoutFor(tab).intents.insertPanel(panelId);
    return true;
  }

  /** Undock intent bridge — the inverse of `dockPanel`. The leaf is removed
   * from the tab the panel was docked INTO (`dockedPanelTabs`), which is not
   * necessarily the tab on screen now. */
  function undockPanel(panelId: string): void {
    if (!isPanelDocked(panelId)) {
      return;
    }

    deps.panels.undock(panelId);

    if (isPanelDocked(panelId)) {
      return;
    }

    detachDockedLeaf(panelId);
  }

  /** Drop `panelId`'s docked leaf from the tab it was docked into, and forget
   * its attribution. `layoutFor(tab)` CREATES that tab's machine if this
   * session never opened it — deliberately: the writer only ever rewrites
   * tabs whose machine exists, so without this the tab's stored entry would
   * keep the now-dead docked panel and hand it back at the next boot. */
  function detachDockedLeaf(panelId: string): void {
    const tab = dockedPanelTabs.get(panelId);
    dockedPanelTabs.delete(panelId);
    deps.onDockedMembershipChange();

    if (tab) {
      deps.layoutFor(tab).intents.removePanel(panelId);
    }
  }

  /** Dismiss bridge — the docked-safe `dismissPanel`, and the one the UI and
   * the driver must both use.
   *
   * The raw panels dismissal alone drops the panel from the roster while
   * leaving its leaf in whichever layout tree it was docked into: an empty
   * pane with no removal control, a stored entry that resurrects the panel on
   * the next reload, and — worst — a payload whose docked total can climb
   * past `MAX_DOCKED_PANELS`, at which point the writer's own guard refuses
   * every later write for the session.
   *
   * The leaf is detached DIRECTLY rather than by running the undock bridge
   * first, even though undock-then-dismiss reads more symmetrically:
   * `undockPanel`'s reducer re-admits the panel to the floating set, which
   * can evict an unrelated floating panel to stay inside `MAX_LIVE_PANELS` —
   * a panel the user never touched, lost to a dismissal of a different one.
   * Detaching the leaf skips that entirely. */
  function dismissPanel(panelId: string): void {
    if (isPanelDocked(panelId)) {
      detachDockedLeaf(panelId);
    }

    deps.panels.dismiss(panelId);
  }

  /** Discard the persisted workspace — see `Presenters.resetWorkspaceLayout`.
   * The raw dismissal works on a docked panel directly, so there is no
   * undock-then-dismiss dance; the layout machines are reset wholesale
   * anyway, which drops every docked leaf with them. The reset's own state
   * changes still kick the writer, so the next debounced write re-persists
   * the (now default, docked-free) workspace rather than leaving the cleared
   * preference and live state disagreeing.
   *
   * Clearing `persistedWorkspace` is as load-bearing as clearing the stored
   * string: `layoutFor` is lazy, so a tab opened for the first time AFTER a
   * reset would otherwise seed from this snapshot and resurrect exactly the
   * tree the user just discarded (see the seed's own doc). */
  function resetWorkspaceLayout(): void {
    deps.clearStoredLayout();
    persistedWorkspace = null;

    for (const tab of [...latestLayoutStates.keys()]) {
      deps.layoutFor(tab).intents.reset();
    }

    for (const panel of deps.panels.current()) {
      if (panel.docked) {
        deps.panels.dismiss(panel.panelId);
      }
    }

    dockedPanelTabs.clear();
    deps.onDockedMembershipChange();

    for (const tab of WORKSPACE_TABS) {
      deps.dockLayoutStore.clear(tab);
    }

    deps.onResetsBump();
  }

  function restorePersistedDocks(): void {
    for (const tab of WORKSPACE_TABS) {
      const persistedTab = persistedWorkspace?.tabs[tab];

      if (!persistedTab) {
        continue;
      }

      for (const entry of persistedTab.docked) {
        deps.panels.restore(entry.panelId, entry.spec);
        dockedPanelTabs.set(entry.panelId, tab);
        deps.onDockedMembershipChange();
      }
    }
  }

  function dockedIdsIn(
    tab: WorkspaceTab,
    panels: readonly PanelInstance[],
  ): string[] {
    return panels
      .filter((panel) => {
        return panel.docked && dockedPanelTabs.get(panel.panelId) === tab;
      })
      .map((panel) => {
        return panel.panelId;
      });
  }

  /** `Presenters.layoutPresets`' layer-2 read. `latestLayoutStates` already
   * holds the current state of every tab whose machine exists; for a tab
   * opened for the FIRST time by this very call, `layoutFor` creates it and
   * records its state before returning (the module doc's contract). */
  function layoutStateNow(tab: WorkspaceTab): LayoutState {
    const known = latestLayoutStates.get(tab);

    if (known) {
      return known;
    }

    deps.layoutFor(tab);
    const recorded = latestLayoutStates.get(tab);

    // A core whose `layoutFor` records late would otherwise hand a preset
    // save the DEFAULT tree for a seeded tab — absence read as a value.
    if (recorded === undefined) {
      throw new Error(
        `workspaceDock: layoutFor("${tab}") did not record its state before returning`,
      );
    }

    return recorded;
  }

  function dockedPlacements(): readonly DockedPanelPlacement[] {
    return deps.panels
      .current()
      .flatMap((panel): readonly DockedPanelPlacement[] => {
        const tab = dockedPanelTabs.get(panel.panelId);

        // A docked panel with no spec (an "unsupported" instance) or no
        // recorded tab cannot be persisted; the writer prunes its leaf from
        // the written tree instead of emitting an entry the parser would
        // reject on the next boot.
        if (!panel.docked || !panel.spec || !tab) {
          return [];
        }

        return [{ panelId: panel.panelId, spec: panel.spec, tab }];
      });
  }

  return {
    dockPanel,
    undockPanel,
    dismissPanel,
    resetWorkspaceLayout,
    restorePersistedDocks,
    dockedIdsIn,
    dockedPanelIdsNow: (tab: WorkspaceTab): readonly string[] => {
      return dockedIdsIn(tab, deps.panels.current());
    },
    layoutStateNow,
    seedFor: (tab: WorkspaceTab): LayoutState | undefined => {
      return persistedWorkspace?.tabs[tab]?.layout;
    },
    recordLayoutState: (tab: WorkspaceTab, state: LayoutState): void => {
      latestLayoutStates.set(tab, state);
    },
    createdLayouts: (): ReadonlyMap<WorkspaceTab, LayoutState> => {
      return latestLayoutStates;
    },
    dockedPlacements,
    reportDetachedPanels: (
      tab: WorkspaceTab,
      panelIds: readonly string[],
    ): void => {
      detachedPanelIdsByTab.set(tab, [...panelIds]);
    },
    detachedPanelIds: (tab: WorkspaceTab): readonly string[] => {
      return detachedPanelIdsByTab.get(tab) ?? [];
    },
  };
}
