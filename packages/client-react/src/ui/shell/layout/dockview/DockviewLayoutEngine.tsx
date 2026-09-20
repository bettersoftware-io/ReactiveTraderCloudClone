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
  instanceIdFor,
  type LayoutIntents,
  type LayoutPanelInstance,
  PANEL_SPECS,
  type PanelId,
  type PanelSpec,
  type WorkspaceTab,
} from "@rtc/client-core";
import {
  createDockEngine,
  type DockDynamicPanel,
  type DockEngine,
  type DockMaximizeScope,
  type DockStripMap,
  type DockStripOrientation,
  seedPanelIdsOf,
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
 * state (`mounted`, `groups`, `strips`, `appliedCollapse`, `appliedDocked`,
 * `appliedInstances`) to its initial value, and builds a fresh one from the tab's now-cleared
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
 * `try`/`finally`): `createDockEngine`'s `dispose()` flushes one final
 * serialize once a pointer has touched the dock since construction (see
 * #737) — a mid-rebuild engine has almost always been touched by then, so
 * a dirty engine still flushes on reset, and without a guard that flush
 * would call `store.save` with the OLD (about-to-be-discarded) blob,
 * landing it right back in the store composition's `resetWorkspaceLayout()`
 * JUST cleared, and the fresh engine would load it straight back,
 * discarding nothing. `suppressSaveRef` is held true for the exact span
 * from before `dispose()` to after the new engine's construction returns —
 * long enough to swallow the dispose flush, short enough that the new
 * engine's OWN (debounced, so always later) save from reconciling
 * `dynamicPanels` still lands normally. That span is a `try`/`finally`: a
 * throwing `createDockEngine` (or an old engine's throwing `dispose()`)
 * must not leave saves suppressed for the rest of the session. */
export function DockviewLayoutEngine({
  tab,
  registry,
  headRegistry,
  specs = PANEL_SPECS,
  store,
  maximized,
  collapsed,
  closed,
  docked,
  instances,
  layoutResets,
  onMaximize,
  onRestore,
  onCollapse,
  onExpand,
  onCloseInstance,
  onDetachedPanelsChange,
  onSnapshotSourceChange,
}: DockviewLayoutEngineProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<DockEngine | null>(null);
  const [mounted, setMounted] = useState<readonly MountedSlot[]>([]);
  const nextMountId = useRef(0);
  const [groups, setGroups] = useState(0);
  // Which way each collapsed panel's strip reads — decided by the engine
  // from the axis the panel's space reclaims along (createDockEngine's
  // reclaim-split walk) and pushed whole through onStripsChange: one panel's
  // collapse can flip its SIBLINGS (the last strip completing a rail column
  // turns the whole column vertical), so the bridge never derives this from
  // the intent it dispatched.
  const [strips, setStrips] = useState<StripMap>({});
  // Panels currently living in a pop-out window — ENGINE-owned session
  // state surfaced whole through onPopoutsChange (the strips idiom), never
  // the machine's: "popped" is not a workspace semantic the other engine
  // honours, and a reload restores docked (the blob scrub is the second
  // lock).
  const [popped, setPopped] = useState<readonly PanelId[]>([]);
  // Panels currently living in a FLOATING group — the same engine-owned,
  // whole-set-on-change idiom as `popped` (onFloatsChange mirrors
  // onPopoutsChange's shape), but UNLIKE popped state, floating IS
  // persisted: a float is layer-3 arrangement, like a drag or a stack, so a
  // reload restores it — nothing here clears it on its own the way the reset
  // effect clears `popped`.
  const [floating, setFloating] = useState<readonly PanelId[]>([]);
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
  // The same construction-time-only read as `dockedRef`, for the layout
  // machine's chart instances — a SEPARATE channel from `docked`, so the
  // instance diff effect below can never act on a Jarvis-docked id.
  const instancesRef = useRef(instances);
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
  // Read through a ref for the same reason as `specsRef`/`dockedRef`/
  // `layoutResetsRef`: the mount and rebuild effects below call the CURRENT
  // `onSnapshotSourceChange` right after building (and with `null` right
  // before disposing), but reading the prop directly there would make it a
  // genuine dependency of those effects — which would tear down and rebuild
  // the engine on every render where the caller happens to pass a new
  // function identity (Phase 6b's `useRegisterLayoutSnapshot()` passthrough
  // is expected to be composition-root-stable, but this bridge doesn't lean
  // on that assumption any more than it leans on `specs`/`docked` being
  // stable). Kept current by the same layout effect that syncs the other
  // construction-time-only refs.
  const onSnapshotSourceChangeRef = useRef(onSnapshotSourceChange);
  // The collapse set last pushed into the engine, so the collapsed effect
  // below diffs rather than re-asserts (see it). RESET whenever the engine
  // is rebuilt — a fresh engine has nothing collapsed, whatever this said.
  const appliedCollapse = useRef<AppliedCollapse>({ tab, ids: [] });
  // The docked set last pushed into the engine, mirroring `appliedCollapse`
  // (same tab-tagged shape, same reset-on-rebuild rule) — see its comment.
  const appliedDocked = useRef<AppliedDocked>({ tab, ids: [] });
  // The instance ids last pushed into the engine — `appliedDocked`'s twin for
  // the `instances` channel (same tab tag, same reset-on-rebuild rule).
  const appliedInstances = useRef<AppliedDocked>({ tab, ids: [] });
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
    instancesRef.current = instances;
    layoutResetsRef.current = layoutResets;
    onSnapshotSourceChangeRef.current = onSnapshotSourceChange;
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
        // Monotonic per mount: a dockview transaction that re-creates a
        // panel's slot — a pop-out moving the tab into the child window, a
        // drop rebuilding a tab — mounts the NEW element before the old
        // one's dispose runs, so (slot, panelId) alone transiently names
        // two live entries and React warns about duplicate portal keys.
        nextMountId.current += 1;
        const mountId = nextMountId.current;
        setMounted((prev) => {
          return [...prev, { panelId, element, slot, mountId }];
        });

        // A dynamically-docked Jarvis panel always lands in its own solo
        // group AT MOUNT TIME (see `DockDynamicPanel`'s doc: "never stacked
        // into an existing group"), so that group's own DOM root doubles,
        // at that moment, as the shared `panel-<id>` leaf testid
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
        //
        // RESIDUAL, deliberately not fixed: the tag is a snapshot of "solo
        // at mount", not a live truth. Dockview's cross-group drag-and-drop
        // is live in this app, so a later drag CAN make it stale — dragging
        // this panel into another group leaves the tag on a group it no
        // longer occupies, and dragging a second docked panel to MERGE into
        // THIS one's group overwrites the tag, losing it for this panel
        // entirely. The real fix — tagging the panel's own wrapper instead
        // of its (possibly shared) group ancestor — isn't taken: the tag
        // exists only for the docked-panel e2e/PO witnesses, and today's
        // product never combines "docked via Jarvis" with "then dragged" in
        // the flow those witnesses exercise. The disposer below only keeps
        // the COMMON case (dock → undock, no drag in between) honest, via a
        // direct reference to the exact node tagged here — never re-derived
        // by re-querying `.dv-groupview` at dispose time, which could
        // resolve to a DIFFERENT (or no) group after a drag moved this
        // panel — and cleared only if it still names THIS panel, so a
        // drag-merge that already overwrote it with another panel's id is
        // never wrongly erased.
        let taggedGroup: HTMLElement | null = null;

        if (dockedRef.current.includes(panelId)) {
          taggedGroup = element.closest<HTMLElement>(".dv-groupview");
          taggedGroup?.setAttribute("data-testid", `panel-${panelId}`);
        }

        return () => {
          setMounted((prev) => {
            return prev.filter((p) => {
              return p.element !== element;
            });
          });

          if (taggedGroup?.getAttribute("data-testid") === `panel-${panelId}`) {
            taggedGroup.removeAttribute("data-testid");
          }
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
      // Both clients emit a real dist/popout.html at the site root — the
      // minimal page dockview's popout window expects (same-origin).
      popoutUrl: "/popout.html",
      onPopoutsChange: (next: readonly string[]): void => {
        setPopped(next as readonly PanelId[]);
      },
      onFloatsChange: (next: readonly string[]): void => {
        setFloating(next as readonly PanelId[]);
      },
      // Jarvis-docked panels and chart instances, both reconciled at
      // construction — an unlisted dynamic id the blob restored is deleted
      // as an orphan, so an instance missing here loses its blob position.
      dynamicPanels: dynamicPanelsOf(dockedRef.current, instancesRef.current),
    });
    engineRef.current = engine;
    appliedCollapse.current = { tab, ids: [] };
    appliedDocked.current = { tab, ids: [] };
    appliedInstances.current = { tab, ids: [] };
    appliedResetsRef.current = layoutResetsRef.current;
    setGroups(engine.groupCount());
    setLiveEngine(engine);
    // Hands the controller a source that reads the LIVE engine at call time
    // (`engineRef.current`), never `engine` itself — the identical NEW-1
    // hazard this effect's own cleanup guards against, one paragraph below:
    // a save arriving after a rebuild must read the NEW engine, not the one
    // this closure happened to capture at construction.
    onSnapshotSourceChangeRef.current?.(tab, (): string => {
      return engineRef.current?.snapshotLayout() ?? "";
    });

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
      // Unregister BEFORE disposing: a save triggered between this line and
      // `dispose()` must find no source at all, never one that reads a
      // torn-down engine.
      onSnapshotSourceChangeRef.current?.(tab, null);
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
        // Monotonic per mount — see the first construction site's doc: a
        // dockview transaction transiently holds old and new mounts of one
        // (slot, panelId), so the portal key needs a per-mount component.
        nextMountId.current += 1;
        const mountId = nextMountId.current;
        setMounted((prev) => {
          return [...prev, { panelId, element, slot, mountId }];
        });

        // A dynamically-docked Jarvis panel always lands in its own solo
        // group AT MOUNT TIME (see `DockDynamicPanel`'s doc: "never stacked
        // into an existing group"), so that group's own DOM root doubles,
        // at that moment, as the shared `panel-<id>` leaf testid
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
        //
        // RESIDUAL, deliberately not fixed: the tag is a snapshot of "solo
        // at mount", not a live truth. Dockview's cross-group drag-and-drop
        // is live in this app, so a later drag CAN make it stale — dragging
        // this panel into another group leaves the tag on a group it no
        // longer occupies, and dragging a second docked panel to MERGE into
        // THIS one's group overwrites the tag, losing it for this panel
        // entirely. The real fix — tagging the panel's own wrapper instead
        // of its (possibly shared) group ancestor — isn't taken: the tag
        // exists only for the docked-panel e2e/PO witnesses, and today's
        // product never combines "docked via Jarvis" with "then dragged" in
        // the flow those witnesses exercise. The disposer below only keeps
        // the COMMON case (dock → undock, no drag in between) honest, via a
        // direct reference to the exact node tagged here — never re-derived
        // by re-querying `.dv-groupview` at dispose time, which could
        // resolve to a DIFFERENT (or no) group after a drag moved this
        // panel — and cleared only if it still names THIS panel, so a
        // drag-merge that already overwrote it with another panel's id is
        // never wrongly erased.
        let taggedGroup: HTMLElement | null = null;

        if (dockedRef.current.includes(panelId)) {
          taggedGroup = element.closest<HTMLElement>(".dv-groupview");
          taggedGroup?.setAttribute("data-testid", `panel-${panelId}`);
        }

        return () => {
          setMounted((prev) => {
            return prev.filter((p) => {
              return p.element !== element;
            });
          });

          if (taggedGroup?.getAttribute("data-testid") === `panel-${panelId}`) {
            taggedGroup.removeAttribute("data-testid");
          }
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
      // Popped state clears with the engine that owned those windows. The
      // rebuilt engine will NOT re-announce an empty set: its
      // `publishPoppedPanels` starts at `lastPopped = []` and only fires on
      // a CHANGE, so a fresh engine with no popouts is silent — leaving a
      // stale `poppedHere` to grey a docked panel's controls forever. Same
      // reason `setStrips({})` sits directly above.
      setPopped([]);
      // A reset rebuilds from the tab's now-CLEARED blob (a fresh default
      // seed), so any panel that was floating cannot still be — clear it
      // proactively for the identical reason `setPopped([])` does: the fresh
      // engine's own `publishFloatingPanels` starts at `lastFloating = []`
      // and fires only on a CHANGE, so a fresh dock with no floats is
      // silent, and without this the stale `floatingHere` would hide
      // collapse/maximize on a panel that is no longer floating anywhere.
      setFloating([]);
      // Unregister BEFORE disposing the outgoing engine — the mount effect
      // cleanup's identical ordering, and for the identical reason: a save
      // triggered by the dispose flush below (or by anything racing it) must
      // find no source at all, never one that would read the torn-down
      // engine.
      onSnapshotSourceChangeRef.current?.(tab, null);
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
        // Both clients emit a real dist/popout.html at the site root — the
        // minimal page dockview's popout window expects (same-origin).
        popoutUrl: "/popout.html",
        onPopoutsChange: (next: readonly string[]): void => {
          setPopped(next as readonly PanelId[]);
        },
        onFloatsChange: (next: readonly string[]): void => {
          setFloating(next as readonly PanelId[]);
        },
        // Jarvis-docked panels and chart instances, both reconciled at
        // construction — an unlisted dynamic id the blob restored is deleted
        // as an orphan, so an instance missing here loses its blob position.
        dynamicPanels: dynamicPanelsOf(dockedRef.current, instancesRef.current),
      });
      engineRef.current = engine;
      appliedCollapse.current = { tab, ids: [] };
      appliedDocked.current = { tab, ids: [] };
      appliedInstances.current = { tab, ids: [] };
      appliedResetsRef.current = layoutResets;
      setGroups(engine.groupCount());
      setLiveEngine(engine);
      // See the mount effect's identical registration above: the source
      // reads `engineRef.current`, never this closure's own `engine`, so a
      // save that arrives after a LATER rebuild reads whichever engine is
      // current then, not this one.
      onSnapshotSourceChangeRef.current?.(tab, (): string => {
        return engineRef.current?.snapshotLayout() ?? "";
      });
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

  // The layout machine's chart instances — the docked effect's twin on its
  // own channel, declared beside it for the same reason (a collapse replay
  // may name an instance, which must already exist). Removal only ever walks
  // `appliedInstances`, never `appliedDocked`, and `isInstanceId` refuses any
  // id outside the `eq-chart:` namespace, so dropping an instance can never
  // take a Jarvis-docked panel with it. See the maximize effect's
  // STALE-CLOSURE GUARD doc for why `engine !== engineRef.current` is
  // load-bearing here too.
  useEffect(() => {
    const engine = liveEngine;

    if (engine === null || engine !== engineRef.current) {
      return;
    }

    const previous =
      appliedInstances.current.tab === tab ? appliedInstances.current.ids : [];
    const current = instanceIdsOf(instances);

    for (const panelId of current) {
      if (!previous.includes(panelId)) {
        engine.addDynamicPanel(instancePanelOf(panelId));
      }
    }

    for (const panelId of previous) {
      if (!current.includes(panelId) && isInstanceId(panelId)) {
        engine.removeDynamicPanel(panelId);
      }
    }

    appliedInstances.current = { tab, ids: current };
  }, [instances, tab, liveEngine]);

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

  // The WHOLE set of this tab's panels living outside the grid (floating or
  // popped out), reported on every change so a Jarvis layout command on one
  // is refused with a reason rather than recorded as a machine intent the
  // engine will never apply (the engine refuses collapse/maximize on a
  // detached panel). The cleanup reports `[]`: on unmount the engine — and
  // every window/float it owned — is gone, so nothing is detached any more.
  // A dependency change runs that cleanup too, immediately followed by the
  // fresh report in the same commit, so the `[]` is never observable.
  useEffect(() => {
    onDetachedPanelsChange?.(tab, [...floating, ...popped]);

    return () => {
      onDetachedPanelsChange?.(tab, []);
    };
  }, [floating, popped, tab, onDetachedPanelsChange]);

  // The closed set reconciles rather than diffs: closePanel no-ops on an
  // absent panel and reopenPanel on a present one, so re-asserting the whole
  // seed set is already idempotent — and it is what makes every rebuild path
  // (StrictMode double-mount, tab switch, blob saved while closed) converge
  // on the machine's state with no applied-list bookkeeping.
  //
  // Task 10 (saved layouts e2e) found this missing the SAME STALE-CLOSURE
  // GUARD the maximize/docked/instances/collapsed effects above all carry:
  // a click that both reopens a closed panel (this effect's `closed` dep)
  // AND rebuilds the engine (Default, or loading a saved layout) — a real
  // click handler batches BOTH into one commit, but `setLiveEngine` inside
  // the reset effect's OWN layout effect forces a second, synchronous
  // re-render before paint, and without the guard THIS effect's stale
  // Commit-A closure ran reopenPanel/closePanel against the by-then-DISPOSED
  // old engine — dockview-core's own `_doAddPanel` then throws "Invalid
  // grid element" trying to add into a torn-down instance's grid, which
  // React (with no error boundary around this component) unmounts entirely.
  // jsdom DOES reproduce this reliably — confirmed by temporarily weakening
  // this guard back to `engine === null` and watching the sibling bridge
  // spec's own "reopens a panel closed before a rebuild that arrives in the
  // same commit" case throw the identical "Invalid grid element" error, then
  // restoring it. No EXISTING bridge test caught it before, simply because
  // none of the four preset-load/reset spec files combined a `closed`
  // change with a `layoutResets` bump in one commit until that case was
  // added. Solid's sibling effect (client-solid's own
  // DockviewLayoutEngine.tsx) reads the live `liveEngine()` signal rather
  // than a plain variable and never hit this, but was hardened to match
  // anyway (see its own comment).
  useEffect(() => {
    const engine = liveEngine;

    if (engine === null || engine !== engineRef.current) {
      return;
    }

    for (const panelId of seedPanelIdsOf(
      createDefaultLayoutPort(tab).initial.root,
    )) {
      if (closed.includes(panelId)) {
        engine.closePanel(panelId);
      } else {
        engine.reopenPanel(panelId);
      }
    }
  }, [closed, tab, liveEngine]);

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

  function popoutPanel(panelId: PanelId) {
    return () => {
      // Fire-and-forget: the engine resolves false when the browser blocks
      // window.open — nothing to surface, the dock simply stays as-is.
      void engineRef.current?.popoutPanel(panelId);
    };
  }

  // Attached only while no maximize is live (spec §3.2, Ruling 32): a float
  // while a strip owns the grid has no coherent home, the engine refuses it
  // (R3), and a control that does nothing is worse than none. Withheld on
  // EVERY head — a floating panel's "Dock" included, since docking into a
  // maximize-owned grid lands it in the same incoherent spot.
  function floatOrDockPanel(panelId: PanelId) {
    return () => {
      if (floating.includes(panelId)) {
        engineRef.current?.dockPanel(panelId);
        return;
      }

      engineRef.current?.floatPanel(panelId);
    };
  }

  function closeInstancePanel(panelId: PanelId) {
    return () => {
      onCloseInstance(panelId);
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

  // Only a chart instance's head gets the close control — a static panel
  // closes through the View menu, a Jarvis-docked one through its own head.
  const instanceIds = instanceIdsOf(instances);

  // `data-collapsed` witnesses that the collapse set reached this bridge —
  // identically for both clients — while the strip itself is a real
  // `PanelStrip` in the body slot, just as in-house.
  //
  // `data-maximized` is the SAME render as the in-house engine's own
  // `state.maximized ?? ""`, and must stay unconditional for the same reason
  // `data-collapsed` is: the shared page object reads one attribute for both
  // engines, so an engine that omits it reports "nothing is maximized" rather
  // than "this engine has no witness". `JarvisDriverPage.maximizedPanelId`
  // now throws on absence, which turns that into a loud failure — but only
  // because every engine renders it here.
  return (
    <main
      data-testid="layout-engine"
      data-engine="dockview"
      data-groups={groups}
      data-maximized={maximized ?? ""}
      data-collapsed={collapsed.join(" ")}
      data-closed={closed.join(" ")}
      data-popped={popped.join(" ")}
      data-floating={floating.join(" ")}
      data-instances={instanceIds.join(" ")}
      className={styles.engine}
    >
      <div
        ref={containerRef}
        className={`${styles.container} dockview-theme-rtc`}
      />
      {mounted.map(({ panelId, element, slot, mountId }) => {
        const title = specs[panelId]?.title ?? panelId;
        const strip = strips[panelId];
        return createPortal(
          slot === "tab" ? (
            // `data-dock-strip` tells dockview-hud.css to hide the whole
            // group header while the panel is a strip — the strip bar in
            // the body slot is the panel's entire chrome then, as in-house.
            <div
              data-testid={`dock-tab-${panelId}`}
              data-panel-title={title}
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
                poppedHere={popped.includes(panelId)}
                floatingHere={floating.includes(panelId)}
                onCollapse={collapsePanel(panelId)}
                onMaximize={maximizePanel(panelId)}
                onRestore={onRestore}
                onPopout={popoutPanel(panelId)}
                onFloat={
                  maximized === null ? floatOrDockPanel(panelId) : undefined
                }
                onClose={
                  instanceIds.includes(panelId)
                    ? closeInstancePanel(panelId)
                    : undefined
                }
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
          `${slot}:${panelId}:${mountId}`,
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
  /** Mirrored from the LayoutMachine's layer-2 closed set (View-menu close).
   * The bridge reconciles it against the SEED panel set: close what it
   * names, reopen every other seed panel — both engine calls are
   * no-op-safe, which is also what makes the StrictMode rebuild replay
   * correct with zero bookkeeping. */
  closed: readonly PanelId[];
  /** The active tab's layer-2 docked set — membership only; arrangement lives
   * in the blob. Reconciled into the engine at construction (as
   * `dynamicPanels`) and diffed against on every later render, mirroring how
   * `collapsed` is handled. */
  docked: readonly PanelId[];
  /** The layout machine's layer-2 chart instances — membership only, like
   * `docked`, and on its own channel: reconciled into the engine at every
   * construction (as `dynamicPanels`) and diffed against on every later
   * render. Only this engine renders them (in-house projects them away). */
  instances: readonly LayoutPanelInstance[];
  /** The workspace-reset counter. A bump rebuilds the engine IN PLACE from
   * the tab's now-cleared blob — see the component's REBUILD CONTRACT doc. */
  layoutResets: number;
  /** The same LayoutMachine intents the in-house engine's header controls
   * dispatch, so the header behaves identically under either engine. */
  onMaximize: LayoutIntents["maximize"];
  onRestore: LayoutIntents["restore"];
  onCollapse: LayoutIntents["collapse"];
  onExpand: LayoutIntents["expand"];
  /** Closes a chart instance — attached as the head's close control on
   * instance panels only (never a static or Jarvis-docked panel). */
  onCloseInstance: LayoutIntents["closeInstance"];
  /** Receives the WHOLE set of `tab`'s panels currently floating or popped
   * out, on every change, and `[]` on unmount — engine-owned, session-only
   * state the layout machine never holds. App wires it to
   * `useReportDetachedPanels()` so the Jarvis driver can refuse layout ops
   * on a detached panel; optional because nothing else needs it. */
  onDetachedPanelsChange?: (
    tab: WorkspaceTab,
    panelIds: readonly PanelId[],
  ) => void;
  /** Hands the controller a source that reads the LIVE engine's layout blob
   * on demand, right after construction; receives `null` right before the
   * engine that source read is disposed. Phase 6b's preset SAVE reads
   * through whatever source is currently registered, so this is what makes
   * a save capture the dock exactly as it looks right now rather than
   * whatever the last debounced `onLayoutChange` happened to persist.
   * Optional because nothing needs it outside the real app (every bridge
   * test page that doesn't exercise presets simply omits it). */
  onSnapshotSourceChange?: (
    tab: WorkspaceTab,
    source: (() => string) | null,
  ) => void;
}

interface MountedSlot {
  readonly panelId: PanelId;
  readonly element: HTMLElement;
  /** Which dockview-owned element this is: the panel body, the panel's tab
   * (head slot), or its group's right-hand actions slot (controls). */
  readonly slot: "body" | "tab" | "actions";
  /** Monotonic per mount call — the portal key's uniqueness across a
   * transaction that holds old and new mounts of one slot at once. */
  readonly mountId: number;
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

/** The construction-time `dynamicPanels` for both engine build sites (the
 * mount effect and the `layoutResets` rebuild): Jarvis-docked panels pinned
 * at their design width like a seeded rail, chart instances via
 * {@link instancePanelOf}. */
function dynamicPanelsOf(
  docked: readonly PanelId[],
  instances: readonly LayoutPanelInstance[],
): readonly DockDynamicPanel[] {
  return [
    ...docked.map((panelId): DockDynamicPanel => {
      return { id: panelId, initialPx: DOCK_COLUMN_INITIAL_PX };
    }),
    ...instanceIdsOf(instances).map(instancePanelOf),
  ];
}

/** A chart instance as a dynamic panel, `unpinned`: it opens at
 * `min(the dock column's design width, an equal share)`, and every instance
 * open or close re-equalises its split — instances at their design width
 * while there is room, else instances and the main area in equal shares
 * (pinned, four at 360px crushed the main chart and pushed the last one
 * off-screen). Every site an instance enters the engine goes through here; a
 * Jarvis-docked id never does, so it stays pinned. */
function instancePanelOf(panelId: PanelId): DockDynamicPanel {
  return { id: panelId, initialPx: DOCK_COLUMN_INITIAL_PX, unpinned: true };
}

/** The namespace every chart-instance panel id lives in ("eq-chart:"). */
const INSTANCE_ID_PREFIX = instanceIdFor("eq-chart", "");

function instanceIdsOf(
  instances: readonly LayoutPanelInstance[],
): readonly PanelId[] {
  return instances.map((instance) => {
    return instance.id;
  });
}

/** Whether `panelId` names a chart instance — the guard that keeps instance
 * removal from ever touching a panel outside the instance namespace. */
function isInstanceId(panelId: PanelId): boolean {
  return panelId.startsWith(INSTANCE_ID_PREFIX);
}
