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
 * blob. The construction call itself (`createDockEngine({...})` plus its
 * nested `mountInto` helper) is DUPLICATED VERBATIM between that effect and
 * the `[tab, store]` mount/switch effect below — not factored into a shared
 * function — because ADR-003 bans manual memoization (`useCallback` is a
 * restricted import), and an unmemoized helper referenced from two effects
 * with different dependency lists defeats Biome's exhaustive-deps rule
 * either way (an unstable identity "changes" every render, forcing a
 * re-run on every render, or an incomplete dependency list silently hides
 * real dependencies). Fix round 2 review: keep the two `createDockEngine`
 * bodies text-identical when editing either one — that symmetry is the
 * whole point of duplicating instead of sharing. Both copies seed
 * `appliedResetsRef.current` after building (see NEW-2 below) — that part
 * is NOT a divergence, only ITS SOURCE differs for a reason explained at
 * `layoutResetsRef`'s own declaration (the mount effect reads
 * `layoutResetsRef.current`, never the raw `layoutResets` prop directly, so
 * that read doesn't drag `layoutResets` into its `[tab, store]` dependency
 * list). The two copies' only INTENTIONAL differences beyond that are what's
 * inherent to their surrounding effect, never the construction itself: the
 * mount effect's copy returns a cleanup closure that disposes the CURRENT
 * engine via `engineRef.current`, never the instance it closed over (see
 * NEW-1 in that effect's own doc) — the rebuild effect needs no such
 * closure, since it disposes the OLD engine synchronously at the START of
 * the SAME invocation, not later; and the rebuild effect's copy runs inside
 * the SUPPRESSION GUARD's `try`/`finally` (below), which the mount effect
 * never needs since it never touches `suppressSaveRef`.
 *
 * SUPPRESSION GUARD (fix round 1, review Critical C1; fix round 2 added the
 * `try`/`finally`): `createDockEngine`'s `dispose()` unconditionally flushes
 * one final serialize, even mid-rebuild — without a guard, that flush would
 * call `store.save` with the OLD (about-to-be-discarded) blob, landing it
 * right back in the store composition's `resetWorkspaceLayout()` JUST
 * cleared, and the fresh engine would load it straight back, discarding
 * nothing. `suppressSaveRef` is held true for the exact span from before
 * `dispose()` to after the new engine's construction returns — long enough
 * to swallow the dispose flush, short enough that the new engine's OWN
 * (debounced, so always later) save from reconciling `dynamicPanels` still
 * lands normally. That span is a `try`/`finally`: a throwing
 * `createDockEngine` (or an old engine's throwing `dispose()`) must not
 * leave saves suppressed for the rest of the session. */
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
  // Read through a ref for the same reason as `specsRef`/`dockedRef`: the
  // mount effect below needs the CURRENT `layoutResets` to seed
  // `appliedResetsRef` (see its doc), but reading the raw prop directly
  // there would make it a genuine dependency Biome's exhaustive-deps rule
  // requires listing — which would make `[tab, store]` become `[tab, store,
  // layoutResets]`, firing the MOUNT effect on every reset too (exactly
  // NEW-2's bug, from the other direction). The rebuild effect below reads
  // the raw prop directly instead — `layoutResets` is genuinely one of ITS
  // dependencies, by design.
  const layoutResetsRef = useRef(layoutResets);
  // The collapse set last pushed into the engine, so the collapsed effect
  // below diffs rather than re-asserts (see it). RESET whenever the engine
  // is rebuilt — a fresh engine has nothing collapsed, whatever this said.
  const appliedCollapse = useRef<AppliedCollapse>({ tab, ids: [] });
  // The docked set last pushed into the engine, mirroring `appliedCollapse`
  // (same tab-tagged shape, same reset-on-rebuild rule) — see its comment.
  const appliedDocked = useRef<AppliedDocked>({ tab, ids: [] });
  // See the SUPPRESSION GUARD doc above the component.
  const suppressSaveRef = useRef(false);
  // The `layoutResets` value already reflected in the currently-built
  // engine (fix round 2, review NEW-2). Seeded to the CURRENT prop, not 0:
  // `workspaceLayoutResets$` is session-global and monotonic, so ANY earlier
  // reset in the session leaves `layoutResets` already nonzero for every
  // LATER mount of this component (a fresh instance per tab switch, via
  // App's `key={activeTab}`) — `layoutResets === 0` alone cannot tell "this
  // is a genuine new reset" from "this instance's first render already
  // inherited a nonzero counter". The rebuild effect below no-ops whenever
  // `layoutResets` already matches this, and re-seeds it after a REAL
  // rebuild; the mount effect re-seeds it too, for the same reason a tab/
  // store change there means "this is the current baseline now" (see its
  // own assignment).
  const appliedResetsRef = useRef(layoutResets);
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
  // and `layoutResets` ride along: the engine effect below only reads
  // `dockedRef`/`layoutResetsRef` at CONSTRUCTION time, so this keeps those
  // reads current the same way.
  useLayoutEffect(() => {
    specsRef.current = specs;
    dockedRef.current = docked;
    layoutResetsRef.current = layoutResets;
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

        // A dynamically-docked Jarvis panel always lands in its own solo
        // group (see `DockDynamicPanel`'s doc: "never stacked into an
        // existing group"), so that group's own DOM root doubles, safely
        // and unambiguously, as the shared `panel-<id>` leaf testid
        // `InhouseLayoutEngine`'s `PanelLeaf` carries — the one
        // `jarvis.ts`'s `waitForPanelDockedLive`/`isPanelDocked` key on,
        // engine-agnostically. Dockview itself never gives a single DOM
        // node spanning both the tab (head, holding the unpin control) and
        // content (body) slots — they're separate subtrees it manages — so
        // this reaches for the one ancestor dockview DOES share between
        // them: `.dv-groupview`, the same internal class name `Layout.ts`'s
        // drag helper already keys off (`.dv-tab`). A no-op for a static
        // panel (never in `dockedRef.current`), whose group may legitimately
        // be shared/stacked with siblings.
        if (dockedRef.current.includes(panelId)) {
          element
            .closest<HTMLElement>(".dv-groupview")
            ?.setAttribute("data-testid", `panel-${panelId}`);
        }

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
    appliedResetsRef.current = layoutResetsRef.current;
    setGroups(engine.groupCount());
    setLiveEngine(engine);

    return () => {
      // NEW-1 (fix round 2, Critical): dispose the CURRENT engine — read
      // fresh from `engineRef.current` — never the `engine` this closure
      // captured at construction. After a rebuild, `engine` here is the
      // STALE instance the rebuild effect already disposed and superseded,
      // while `engineRef.current` is the live one. Disposing the stale
      // instance a SECOND time called `serializeLayout()` against an
      // already-torn-down dockview api, which emits a panel-less blob
      // (`{grid:{root:{type:"branch",data:[]}}, panels:{}}`); since
      // `suppressSaveRef` is back to `false` long before this cleanup ever
      // runs (its window closes at the end of the rebuild that already
      // happened), `onLayoutChange` saved that panel-less blob straight into
      // the store — permanently emptying the tab — while the ACTUALLY live
      // engine leaked, never disposed at all. Nulling `engineRef.current`
      // BEFORE disposing (matching the mirror-image ordering everywhere else
      // in this file) also means a second call down any path can't dispose
      // twice through this ref.
      const currentEngine = engineRef.current;
      engineRef.current = null;
      setLiveEngine(null);
      setMounted([]);
      currentEngine?.dispose();
    };
  }, [tab, store]);

  // The workspace-reset rebuild (fix round 2, NEW-3: a LAYOUT effect, not a
  // passive one — the SAME reason as the mount effect above: PR #594's
  // golden lesson was that a passive effect's first commit paints an EMPTY
  // frame before the synchronous engine swap lands, and Playwright's
  // screenshot stabiliser accepts two identical blank frames as "settled".
  // A `useEffect` reset here would reproduce exactly that on the very next
  // paint after a reset).
  //
  // `layoutResets === appliedResetsRef.current` (fix round 2, NEW-2), not
  // `layoutResets === 0`: `workspaceLayoutResets$` is session-global and
  // monotonic, so ANY earlier reset in the session leaves `layoutResets`
  // already nonzero for every LATER mount of this component (a fresh
  // instance per tab switch, via App's `key={activeTab}`) — `=== 0` cannot
  // tell "this is a genuine new reset" from "this instance's first render
  // already inherited a nonzero counter", and treating the latter as a
  // reset would tear down and rebuild the engine THIS SAME COMMIT's mount
  // effect just built (a redundant blank-frame flash, and it also arms
  // NEW-1's cleanup hazard the moment this instance eventually unmounts).
  // `appliedResetsRef` is what actually discriminates the two: this effect
  // no-ops whenever `layoutResets` already matches what the currently-built
  // engine reflects, regardless of whether that shared value is 0 or
  // several resets deep. `[layoutResets, tab, store]` is a complete
  // dependency list — see the mount effect's doc above for why the
  // construction body is duplicated here rather than shared through a named
  // helper.
  useLayoutEffect(() => {
    if (layoutResets === appliedResetsRef.current) {
      return;
    }

    const container = containerRef.current;
    const oldEngine = engineRef.current;

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

        // A dynamically-docked Jarvis panel always lands in its own solo
        // group (see `DockDynamicPanel`'s doc: "never stacked into an
        // existing group"), so that group's own DOM root doubles, safely
        // and unambiguously, as the shared `panel-<id>` leaf testid
        // `InhouseLayoutEngine`'s `PanelLeaf` carries — the one
        // `jarvis.ts`'s `waitForPanelDockedLive`/`isPanelDocked` key on,
        // engine-agnostically. Dockview itself never gives a single DOM
        // node spanning both the tab (head, holding the unpin control) and
        // content (body) slots — they're separate subtrees it manages — so
        // this reaches for the one ancestor dockview DOES share between
        // them: `.dv-groupview`, the same internal class name `Layout.ts`'s
        // drag helper already keys off (`.dv-tab`). A no-op for a static
        // panel (never in `dockedRef.current`), whose group may legitimately
        // be shared/stacked with siblings.
        if (dockedRef.current.includes(panelId)) {
          element
            .closest<HTMLElement>(".dv-groupview")
            ?.setAttribute("data-testid", `panel-${panelId}`);
        }

        return () => {
          setMounted((prev) => {
            return prev.filter((p) => {
              return p.element !== element;
            });
          });
        };
      };
    }

    suppressSaveRef.current = true;

    // MINOR (fix round 2): `try`/`finally` around the whole dispose-then-
    // rebuild span — a throwing `createDockEngine` (or a throwing old
    // engine `dispose()`) must not leave `suppressSaveRef` stuck `true` for
    // the rest of the session, silently dropping every later save.
    try {
      engineRef.current = null;
      setLiveEngine(null);
      setMounted([]);
      setGroups(0);
      setStrips({});
      oldEngine?.dispose();

      const engine = createDockEngine({
        container,
        seed: createDefaultLayoutPort(tab).initial.root,
        blob: store.load(tab),
        panels: {
          title: (id: string): string => {
            return specsRef.current[id as PanelId]?.title ?? id;
          },
          // The in-house maximizeBoundaryPath reads the same spec field:
          // rail panels fill their own column, everything else the whole
          // dock.
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
      appliedResetsRef.current = layoutResets;
      setGroups(engine.groupCount());
      setLiveEngine(engine);
    } finally {
      suppressSaveRef.current = false;
    }
  }, [layoutResets, tab, store]);

  // STALE-CLOSURE GUARD (fix round 1, review I1/I4 investigation; applies
  // identically to this effect and the docked/collapse effects below — see
  // their own shorter pointers back to this doc): a rebuild triggered by the
  // SAME render that ALSO changes `docked`'s (or `collapsed`'s) own
  // reference — even to an UNCHANGED-content array — schedules TWO commits:
  // commit A, from the render itself, whose effect closures still capture
  // the OLD `liveEngine` (React fixes each commit's closures at render
  // time, before ANY effect — including the reset effect above, which may
  // already have rebuilt the engine and reset `appliedDocked`/
  // `appliedCollapse` by the time a LATER effect in the SAME commit runs —
  // has a chance to run); and commit B, from `setLiveEngine(newEngine)`
  // inside that reset. Commit A's stale invocation, left unguarded, would
  // call a method on the ALREADY-DISPOSED old engine and (for the docked/
  // collapse effects) mark `appliedDocked.current`/`appliedCollapse.current`
  // as already applied — poisoning the baseline commit B's (correct)
  // invocation then reads, so the fresh engine never gets the intent
  // replayed at all. `engine !== engineRef.current` recognises a stale
  // commit-A closure (its `liveEngine` no longer matches the canonical,
  // current engine the reset already installed) and no-ops it completely.
  // Declaration order relative to the reset effect above does NOT prevent
  // this — every effect here is scheduled by, and closes over, the SAME
  // commit either way.
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
  // an existing id. See the maximize effect's STALE-CLOSURE GUARD doc above
  // for why `engine !== engineRef.current` is load-bearing here too.
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
  // See the maximize effect's STALE-CLOSURE GUARD doc above for why
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
