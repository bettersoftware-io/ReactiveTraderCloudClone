import {
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  createDefaultLayoutPort,
  DOCK_COLUMN_INITIAL_PX,
  type DockLayoutStore,
  type LayoutIntents,
  PANEL_SPECS,
  type PanelId,
  type PanelSpec,
  type WorkspaceTab,
} from "@rtc/client-core";
import {
  createDockEngine,
  type DockEngine,
  type DockMaximizeScope,
  type DockStripMap,
  type DockStripOrientation,
} from "@rtc/layout-dockview";
import "@rtc/layout-dockview/styles/dockview-hud.css";

import { PanelErrorBoundary } from "../engine/PanelErrorBoundary";
import { PanelHeadControls } from "../engine/PanelHeadControls";
import { PanelHeadSlot } from "../engine/PanelHeadSlot";
import { PanelStrip } from "../engine/PanelStrip";
import type { PanelRegistry } from "../engine/panelRegistry";

import styles from "./DockviewLayoutEngine.module.css";

/** Dockview-backed workspace engine. Dockview owns geometry (drag, tabs,
 * splits); everything the user SEES of a panel stays in the app's React tree
 * via portals — the body into dockview's content slot, the head slot into
 * dockview's tab (its drag surface), the collapse/maximize controls into the
 * group's actions slot — so ViewModel/FxView/CreditView contexts flow (a
 * separate root would crash every context consumer) and the header is the
 * very same `PanelHead` nodes the in-house engine renders. The persisted
 * layout is an opaque blob per tab.
 *
 * REBUILD CONTRACT: a workspace reset is a `layoutResets` PROP bump (App.tsx
 * passes the counter straight through, no `key`), handled by the rebuild
 * effect below: it disposes the current engine, resets every per-engine ref/
 * state (`mounted`, `groups`, `strips`, `appliedCollapse`, `appliedDocked`)
 * to its initial value, and builds a fresh one from the tab's now-cleared
 * blob — the SAME construction the `[tab, store]` effect below runs for a
 * genuine mount/tab-switch. That construction body is DUPLICATED between
 * the two effects rather than factored into a shared function: ADR-003 bans
 * manual memoization (`useCallback` is a restricted import), and an
 * unmemoized helper referenced from two effects with different dependency
 * lists defeats Biome's exhaustive-deps rule either way (an unstable
 * identity "changes" every render, or an incomplete dependency list hides
 * real ones) — see each effect's own doc.
 *
 * SUPPRESSION GUARD (fix round 1, review Critical C1): `createDockEngine`'s
 * `dispose()` unconditionally flushes one final serialize, even mid-rebuild
 * — without a guard, that flush would call `store.save` with the OLD
 * (about-to-be-discarded) blob, landing it right back in the store
 * composition's `resetWorkspaceLayout()` JUST cleared, and the fresh engine
 * would load it straight back, discarding nothing. `suppressSaveRef` is held
 * true for the exact span from before `dispose()` to after the new engine's
 * construction returns — long enough to swallow the dispose flush, short
 * enough that the new engine's OWN (debounced, so always later) save from
 * reconciling `dynamicPanels` still lands normally. */
export function DockviewLayoutEngine({
  tab,
  registry,
  headRegistry,
  specs = PANEL_SPECS,
  store,
  maximized,
  collapsed,
  docked,
  layoutResets,
  onMaximize,
  onRestore,
  onCollapse,
  onExpand,
}: DockviewLayoutEngineProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<DockEngine | null>(null);
  const [mounted, setMounted] = useState<readonly MountedSlot[]>([]);
  const [groups, setGroups] = useState(0);
  // Which way each collapsed panel's strip reads — decided by the engine
  // from the axis the panel's space reclaims along (createDockEngine's
  // reclaim-split walk) and pushed whole through onStripsChange: one panel's
  // collapse can flip its SIBLINGS (the last strip completing a rail column
  // turns the whole column vertical), so the bridge never derives this from
  // the intent it dispatched.
  const [strips, setStrips] = useState<StripMap>({});
  // Read through a ref by the engine's title hook: `specs` (like `registry`)
  // is rebuilt by WorkspaceEngine on every render, so listing it as a dep of
  // the engine effect below would tear dockview down and rebuild it from
  // the blob on every layout-state change — which is precisely a collapse,
  // whose pre-collapse geometry lives only in the engine that applied it
  // (the rebuilt one would "restore" the 32px strip to dockview's 100px
  // default minimum instead). The engine lives for the tab; only the store
  // (an app singleton) could legitimately swap it.
  const specsRef = useRef(specs);
  // Read through a ref for the same reason as `specsRef`: `docked` is only
  // needed at ENGINE CREATION time (as the construction-time `dynamicPanels`
  // reconciliation list) — the diff effect below reads the prop directly for
  // every later render, this ref only feeds a fresh engine's initial build.
  const dockedRef = useRef(docked);
  // The collapse set last pushed into the engine, so the collapsed effect
  // below diffs rather than re-asserts (see it). RESET whenever the engine
  // is rebuilt — a fresh engine has nothing collapsed, whatever this said.
  const appliedCollapse = useRef<AppliedCollapse>({ tab, ids: [] });
  // The docked set last pushed into the engine, mirroring `appliedCollapse`
  // (same tab-tagged shape, same reset-on-rebuild rule) — see its comment.
  const appliedDocked = useRef<AppliedDocked>({ tab, ids: [] });
  // See the SUPPRESSION GUARD doc above the component.
  const suppressSaveRef = useRef(false);
  // The engine as STATE (beside the ref the callbacks read), so the intent
  // effects below depend on the instance and re-push the LayoutMachine's
  // `maximized` / `collapsed` into every NEW engine. Matters under
  // StrictMode's dev double-invocation: the layout effect's cleanup disposes
  // engine A — flushing its STRIPPED geometry into the store — and the re-run
  // builds B from that blob, where the strip's group sits at dockview's
  // ~100px minimum with no collapse recorded. Keyed on `maximized` /
  // `collapsed` alone, the effects did not re-run for B, the applied list
  // still said "done", B never collapsed, and the restore bar (rendered from
  // A's strips state) stretched across a 97px group — the shape the first
  // `app/fx-collapsed-dockview` golden captured. The SAME mechanism is what
  // makes a `layoutResets` rebuild re-apply `maximized`/`docked`/`collapsed`
  // onto the fresh engine below: the reset effect calls `setLiveEngine` with
  // the new instance, and every intent effect depends on `liveEngine`.
  const [liveEngine, setLiveEngine] = useState<DockEngine | null>(null);

  // Synced in an effect (not during render — React Compiler forbids touching
  // refs there); a LAYOUT effect declared BEFORE the engine effect so it runs
  // first and the engine's title hook always sees the current specs. `docked`
  // rides along: the engine effect below only reads `dockedRef` at
  // CONSTRUCTION time, so this keeps that read current the same way.
  useLayoutEffect(() => {
    specsRef.current = specs;
    dockedRef.current = docked;
  });

  // A layout effect, not a passive one: dockview is created — and the slot
  // portals committed by the synchronous `setMounted` flush a layout effect
  // gets — BEFORE the browser paints, so the workspace's first frame already
  // shows the panels, exactly as the in-house engine's synchronous render
  // and the Solid bridge's `onMount` do. Under a passive effect the first
  // frame was an EMPTY workspace: Playwright's screenshot stabiliser accepts
  // two identical consecutive frames, and in the classic skins (no ambient
  // animation to keep frames changing) the x86 runner captured that blank
  // frame as the `app/fx-dockview` golden — the React tier then "passed"
  // against it while Solid's panels failed.
  //
  // The construction body here is DUPLICATED, not shared, with the rebuild
  // effect below (see its own doc) — the project bans manual memoization
  // (ADR-003, `useCallback` is a restricted import), so a helper function
  // referenced from BOTH effects would need an unstable per-render identity
  // Biome's exhaustive-deps rule cannot verify without either an incomplete
  // dependency list or a re-run on every render either way. Each effect
  // instead reads `tab`/`store` (and declares its own `mountInto`) directly,
  // exactly as this effect did before the `docked`/`layoutResets` props
  // existed — mirroring, not violating, the pre-existing pattern here.
  useLayoutEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    function mountInto(
      slot: MountedSlot["slot"],
    ): (id: string, element: HTMLElement) => () => void {
      return (id: string, element: HTMLElement): (() => void) => {
        const panelId = id as PanelId;
        setMounted((prev) => {
          return [...prev, { panelId, element, slot }];
        });

        return () => {
          setMounted((prev) => {
            return prev.filter((p) => {
              return p.element !== element;
            });
          });
        };
      };
    }

    const engine = createDockEngine({
      container,
      seed: createDefaultLayoutPort(tab).initial.root,
      blob: store.load(tab),
      panels: {
        title: (id: string): string => {
          return specsRef.current[id as PanelId]?.title ?? id;
        },
        // The in-house maximizeBoundaryPath reads the same spec field: rail
        // panels fill their own column, everything else the whole dock.
        maximizeScope: (id: string): DockMaximizeScope => {
          return specsRef.current[id as PanelId]?.maximizeScope ?? "root";
        },
        mount: mountInto("body"),
        mountTab: mountInto("tab"),
        mountActions: mountInto("actions"),
      },
      onLayoutChange: (blob: string): void => {
        // See the SUPPRESSION GUARD doc above the component.
        if (suppressSaveRef.current) {
          return;
        }

        store.save(tab, blob);
        setGroups(engineRef.current?.groupCount() ?? 0);
      },
      onStripsChange: (next: DockStripMap): void => {
        setStrips(next as StripMap);
      },
      dynamicPanels: dockedRef.current.map((panelId) => {
        return { id: panelId, initialPx: DOCK_COLUMN_INITIAL_PX };
      }),
    });
    engineRef.current = engine;
    appliedCollapse.current = { tab, ids: [] };
    appliedDocked.current = { tab, ids: [] };
    setGroups(engine.groupCount());
    setLiveEngine(engine);

    return () => {
      engineRef.current = null;
      setLiveEngine(null);
      setMounted([]);
      engine.dispose();
    };
  }, [tab, store]);

  // The workspace-reset rebuild: `layoutResets` starts at 0 (composition's
  // `workspaceLayoutResets$` seed), so a bump past that is a genuine reset,
  // never the mount itself — the `[tab, store]` effect above already built
  // the engine for THIS mount, so re-building here on the FIRST render would
  // both duplicate that work and dispose an engine nothing has used yet.
  // This `layoutResets === 0` check is a real use of the prop inside the
  // effect body, so `[layoutResets, tab, store]` is a complete dependency
  // list — see the mount effect's doc above for why the construction body
  // is duplicated here rather than shared through a named helper. */
  useEffect(() => {
    if (layoutResets === 0) {
      return;
    }

    const container = containerRef.current;
    const oldEngine = engineRef.current;

    if (container === null) {
      return;
    }

    suppressSaveRef.current = true;
    engineRef.current = null;
    setLiveEngine(null);
    setMounted([]);
    setGroups(0);
    setStrips({});
    oldEngine?.dispose();

    function mountInto(
      slot: MountedSlot["slot"],
    ): (id: string, element: HTMLElement) => () => void {
      return (id: string, element: HTMLElement): (() => void) => {
        const panelId = id as PanelId;
        setMounted((prev) => {
          return [...prev, { panelId, element, slot }];
        });

        return () => {
          setMounted((prev) => {
            return prev.filter((p) => {
              return p.element !== element;
            });
          });
        };
      };
    }

    const engine = createDockEngine({
      container,
      seed: createDefaultLayoutPort(tab).initial.root,
      blob: store.load(tab),
      panels: {
        title: (id: string): string => {
          return specsRef.current[id as PanelId]?.title ?? id;
        },
        maximizeScope: (id: string): DockMaximizeScope => {
          return specsRef.current[id as PanelId]?.maximizeScope ?? "root";
        },
        mount: mountInto("body"),
        mountTab: mountInto("tab"),
        mountActions: mountInto("actions"),
      },
      onLayoutChange: (blob: string): void => {
        // See the SUPPRESSION GUARD doc above the component.
        if (suppressSaveRef.current) {
          return;
        }

        store.save(tab, blob);
        setGroups(engineRef.current?.groupCount() ?? 0);
      },
      onStripsChange: (next: DockStripMap): void => {
        setStrips(next as StripMap);
      },
      dynamicPanels: dockedRef.current.map((panelId) => {
        return { id: panelId, initialPx: DOCK_COLUMN_INITIAL_PX };
      }),
    });
    engineRef.current = engine;
    appliedCollapse.current = { tab, ids: [] };
    appliedDocked.current = { tab, ids: [] };
    setGroups(engine.groupCount());
    setLiveEngine(engine);

    suppressSaveRef.current = false;
  }, [layoutResets, tab, store]);

  useEffect(() => {
    if (liveEngine === null || liveEngine !== engineRef.current) {
      return;
    }

    if (maximized !== null) {
      liveEngine.maximizePanel(maximized);
    } else {
      liveEngine.exitMaximize();
    }
  }, [maximized, liveEngine]);

  // The docked set is a SET, not a single id, so — like `collapsed` below —
  // this diffs against the last applied list rather than re-asserting the
  // whole thing every render. Declared BETWEEN the maximize effect above and
  // the collapse effect below: a dynamic panel must exist in the engine
  // before a collapse replay can name it. The initial pass over a freshly
  // rebuilt engine re-adds ids already present via construction-time
  // `dynamicPanels` reconciliation — safe, since `addDynamicPanel` no-ops on
  // an existing id.
  //
  // STALE-CLOSURE GUARD (fix round 1, review I1/I4 investigation): a rebuild
  // triggered by the SAME render that ALSO changes `docked`'s (or
  // `collapsed`'s) own reference — even to an UNCHANGED-content array —
  // schedules TWO commits: commit A, from the render itself, whose effect
  // closures still capture the OLD `liveEngine` (React fixes each commit's
  // closures at render time, before ANY effect — including the reset effect
  // ABOVE, which may already have rebuilt the engine and reset
  // `appliedDocked`/`appliedCollapse` by the time THIS effect runs within
  // the SAME commit — has a chance to run); and commit B, from
  // `setLiveEngine(newEngine)` inside that reset. Commit A's stale
  // invocation, left unguarded, would call a method on the ALREADY-DISPOSED
  // old engine AND mark `appliedDocked.current`/`appliedCollapse.current` as
  // already applied — poisoning the baseline commit B's (correct) invocation
  // then reads, so the fresh engine never gets the intent replayed at all.
  // `engine !== engineRef.current` recognises a stale commit-A closure (its
  // `liveEngine` no longer matches the canonical, current engine the reset
  // already installed) and no-ops it completely, leaving the bookkeeping for
  // commit B's invocation to set correctly. Declaration order relative to
  // the reset effect above does NOT prevent this — both effects are
  // scheduled by, and close over, the SAME commit either way.
  useEffect(() => {
    const engine = liveEngine;

    if (engine === null || engine !== engineRef.current) {
      return;
    }

    const previous =
      appliedDocked.current.tab === tab ? appliedDocked.current.ids : [];

    for (const panelId of docked) {
      if (!previous.includes(panelId)) {
        engine.addDynamicPanel({
          id: panelId,
          initialPx: DOCK_COLUMN_INITIAL_PX,
        });
      }
    }

    for (const panelId of previous) {
      if (!docked.includes(panelId)) {
        engine.removeDynamicPanel(panelId);
      }
    }

    appliedDocked.current = { tab, ids: docked };
  }, [docked, tab, liveEngine]);

  // `collapsed` is a SET, not a single id like `maximized`, so this diffs
  // against the last applied list rather than re-asserting the whole thing:
  // `collapsePanel` remembers the pre-collapse geometry on the FIRST call for a
  // panel, so blanket-reapplying is safe but pointless work every render.
  // `tab` is a dep because switching tabs rebuilds the engine — the new one has
  // nothing collapsed, so the previously-applied list must reset with it or the
  // diff would skip re-collapsing panels the fresh engine has never seen;
  // `liveEngine` covers every OTHER rebuild the same way (see its comment).
  // See the docked effect's STALE-CLOSURE GUARD doc above for why
  // `engine !== engineRef.current` is load-bearing here too.
  useEffect(() => {
    const engine = liveEngine;

    if (engine === null || engine !== engineRef.current) {
      return;
    }

    const previous =
      appliedCollapse.current.tab === tab ? appliedCollapse.current.ids : [];

    for (const panelId of collapsed) {
      if (!previous.includes(panelId)) {
        engine.collapsePanel(panelId);
      }
    }

    for (const panelId of previous) {
      if (!collapsed.includes(panelId)) {
        engine.expandPanel(panelId);
      }
    }

    appliedCollapse.current = { tab, ids: collapsed };
  }, [collapsed, tab, liveEngine]);

  function collapsePanel(panelId: PanelId) {
    return () => {
      onCollapse(panelId);
    };
  }

  function maximizePanel(panelId: PanelId) {
    return () => {
      onMaximize(panelId);
    };
  }

  function expandOrRestorePanel(panelId: PanelId) {
    return () => {
      if (collapsed.includes(panelId)) {
        onExpand(panelId);
      } else {
        onRestore();
      }
    };
  }

  // `data-collapsed` witnesses that the collapse set reached this bridge —
  // identically for both clients — while the strip itself is a real
  // `PanelStrip` in the body slot, just as in-house.
  return (
    <main
      data-testid="layout-engine"
      data-engine="dockview"
      data-groups={groups}
      data-collapsed={collapsed.join(" ")}
      className={styles.engine}
    >
      <div
        ref={containerRef}
        className={`${styles.container} dockview-theme-rtc`}
      />
      {mounted.map(({ panelId, element, slot }) => {
        const title = specs[panelId]?.title ?? panelId;
        const strip = strips[panelId];
        return createPortal(
          slot === "tab" ? (
            // `data-dock-strip` tells dockview-hud.css to hide the whole
            // group header while the panel is a strip — the strip bar in
            // the body slot is the panel's entire chrome then, as in-house.
            <div
              data-testid={`dock-tab-${panelId}`}
              data-dock-strip={strip === undefined ? "false" : "true"}
              className={styles.tabSlot}
            >
              {strip === undefined ? (
                <PanelHeadSlot
                  panelId={panelId}
                  title={title}
                  headContent={headRegistry?.[panelId]}
                />
              ) : null}
            </div>
          ) : slot === "actions" ? (
            strip === undefined ? (
              <PanelHeadControls
                panelId={panelId}
                title={title}
                maximizable={specs[panelId]?.maximizable !== false}
                maximizedHere={maximized === panelId}
                onCollapse={collapsePanel(panelId)}
                onMaximize={maximizePanel(panelId)}
                onRestore={onRestore}
              />
            ) : null
          ) : strip !== undefined ? (
            // A strip is either the user's (in `collapsed` → expand it) or
            // one the maximize forced (→ restore the maximize), exactly the
            // in-house PanelLeaf's branch.
            <PanelStrip
              panelId={panelId}
              title={title}
              orientation={strip}
              onRestore={expandOrRestorePanel(panelId)}
            />
          ) : (
            // data-flip-stage: the scroll container owning the panel's
            // visible height — useFlipGrid's enter sweep anchors to its corner.
            <div className={styles.panelBody} data-flip-stage>
              <PanelErrorBoundary title={title}>
                {registry[panelId]?.()}
              </PanelErrorBoundary>
            </div>
          ),
          element,
          `${slot}:${panelId}`,
        );
      })}
    </main>
  );
}

export interface DockviewLayoutEngineProps {
  tab: WorkspaceTab;
  registry: PanelRegistry;
  headRegistry?: Partial<Record<PanelId, () => ReactElement>>;
  specs?: Readonly<Record<PanelId, PanelSpec>>;
  store: DockLayoutStore;
  /** Mirrored from the LayoutMachine so Jarvis's layout DriveCommand still works. */
  maximized: PanelId | null;
  /** Mirrored from the LayoutMachine, same reason as `maximized`. Dockview has
   * no collapse primitive of its own — the engine emulates it by clamping the
   * panel's group to a strip; see createDockEngine. */
  collapsed: readonly PanelId[];
  /** The active tab's layer-2 docked set — membership only; arrangement lives
   * in the blob. Reconciled into the engine at construction (as
   * `dynamicPanels`) and diffed against on every later render, mirroring how
   * `collapsed` is handled. */
  docked: readonly PanelId[];
  /** The workspace-reset counter. A bump rebuilds the engine IN PLACE from
   * the tab's now-cleared blob — see the component's REBUILD CONTRACT doc. */
  layoutResets: number;
  /** The same LayoutMachine intents the in-house engine's header controls
   * dispatch, so the header behaves identically under either engine. */
  onMaximize: LayoutIntents["maximize"];
  onRestore: LayoutIntents["restore"];
  onCollapse: LayoutIntents["collapse"];
  onExpand: LayoutIntents["expand"];
}

interface MountedSlot {
  readonly panelId: PanelId;
  readonly element: HTMLElement;
  /** Which dockview-owned element this is: the panel body, the panel's tab
   * (head slot), or its group's right-hand actions slot (controls). */
  readonly slot: "body" | "tab" | "actions";
}

type StripMap = Partial<Record<PanelId, DockStripOrientation>>;

/** The collapse set last pushed into the engine, tagged with the tab it was
 * pushed for — a tab switch rebuilds the engine, so the tag is what stops the
 * diff from treating the fresh engine's empty state as already-applied. */
interface AppliedCollapse {
  tab: WorkspaceTab;
  ids: readonly PanelId[];
}

/** The docked set last pushed into the engine, tagged the same way as
 * {@link AppliedCollapse} and for the identical reason. */
interface AppliedDocked {
  tab: WorkspaceTab;
  ids: readonly PanelId[];
}
