import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  For,
  type JSX,
  on,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";

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

/** Dockview-backed workspace engine (Solid twin of client-react's
 * DockviewLayoutEngine). Dockview owns geometry (drag, tabs, splits);
 * everything the user SEES of a panel stays in the app's Solid tree via
 * `Portal` — the body into dockview's content slot, the head slot into
 * dockview's tab (its drag surface), the collapse/maximize controls into the
 * group's actions slot — so ViewModel/FxView/CreditView contexts flow (a
 * separate root would crash every context consumer) and the header is the
 * very same `PanelHead` nodes the in-house engine renders. The persisted
 * layout is an opaque blob per tab.
 *
 * REBUILD CONTRACT (diverges from the react twin, same end state): react
 * remounts the WHOLE bridge on a workspace reset (a `layoutResets` PROP,
 * not a `key`, per fix round 1) because a fresh function-component
 * invocation is a convenient way to discard every ref/state at once there.
 * Solid component bodies run ONCE — there is no "re-invoke and get fresh
 * closures" move — so this component instead takes `layoutResets` as an
 * ordinary prop and rebuilds the engine IN PLACE: the reset effect below
 * disposes the current engine and resets `mounted`/`groups`/`strips`/
 * `applied`/`appliedDocked`/`appliedInstances` to their initial values
 * before calling the SAME `buildEngine()` the initial `onMount` uses, from
 * the tab's now-cleared blob.
 *
 * SUPPRESSION GUARD (fix round 1, review Critical C1): `createDockEngine`'s
 * `dispose()` flushes one final serialize once a pointer has touched the
 * dock since construction (see #737) — a mid-rebuild engine has almost
 * always been touched by then, so a dirty engine still flushes on reset,
 * and without a guard that flush would call `props.store.save` with the OLD
 * (about-to-be-discarded) blob, landing it right back in the store
 * composition's `resetWorkspaceLayout()` JUST cleared, and the fresh engine
 * would load it straight back, discarding nothing. `suppressSave` is held
 * true for the exact span from before `dispose()` to after the new engine's
 * construction returns — long enough to swallow the dispose flush, short
 * enough that the new engine's OWN (debounced, so always later) save from
 * reconciling `dynamicPanels` still lands normally.
 *
 * `liveEngine` (fix round 1, review I2): the maximize/docked/collapse
 * effects below read `liveEngine()`, a SIGNAL the reset effect and
 * `buildEngine()` write via `setLiveEngine` — the react twin's `liveEngine`
 * STATE, for the identical reason: writing a NEW value to a signal an
 * effect reads is what makes it re-run, so those three effects re-apply
 * their current props onto a FRESH engine even on a tick where the prop
 * itself didn't change value (see the reset effect's own doc for why this
 * is NOT about which effect is merely declared first). */
export function DockviewLayoutEngine(
  props: DockviewLayoutEngineProps,
): JSX.Element {
  const [mounted, setMounted] = createSignal<readonly MountedSlot[]>([]);
  const [groups, setGroups] = createSignal(0);
  // Which way each collapsed panel's strip reads — decided by the engine
  // from the axis the panel's space reclaims along (createDockEngine's
  // reclaim-split walk) and pushed whole through onStripsChange: one panel's
  // collapse can flip its SIBLINGS (the last strip completing a rail column
  // turns the whole column vertical), so the bridge never derives this from
  // the intent it dispatched.
  const [strips, setStrips] = createSignal<StripMap>({});
  // Panels currently living in a pop-out window — ENGINE-owned session
  // state surfaced whole through onPopoutsChange (the strips idiom), never
  // the machine's: "popped" is not a workspace semantic the other engine
  // honours, and a reload restores docked (the blob scrub is the second
  // lock).
  const [popped, setPopped] = createSignal<readonly PanelId[]>([]);
  // Panels currently living in a FLOATING group — the same engine-owned,
  // whole-set-on-change idiom as `popped` (onFloatsChange mirrors
  // onPopoutsChange's shape), but UNLIKE popped state, floating IS
  // persisted: a float is layer-3 arrangement, like a drag or a stack, so a
  // reload restores it — nothing here clears it on its own the way the reset
  // effect clears `popped`.
  const [floating, setFloating] = createSignal<readonly PanelId[]>([]);
  // See the `liveEngine` doc above the component.
  const [liveEngine, setLiveEngine] = createSignal<DockEngine | null>(null);
  let containerEl: HTMLDivElement | undefined;
  // The engine as a PLAIN variable, beside the `liveEngine` signal: cleanup
  // and the `onLayoutChange` closure need only the CURRENT instance (an
  // imperative read, exactly react's `engineRef`), not a tracked one —
  // reading `liveEngine()` there would be an untracked read anyway (both
  // run outside any Solid computation), so a plain variable says that
  // plainly instead of relying on a signal read's default outside-tracking
  // behaviour.
  let engine: DockEngine | null = null;
  // See the SUPPRESSION GUARD doc above the component.
  let suppressSave = false;

  function specs(): Readonly<Record<PanelId, PanelSpec>> {
    return props.specs ?? PANEL_SPECS;
  }

  function titleOf(panelId: PanelId): string {
    return specs()[panelId]?.title ?? panelId;
  }

  function collapsePanel(panelId: PanelId) {
    return () => {
      props.onCollapse(panelId);
    };
  }

  function maximizePanel(panelId: PanelId) {
    return () => {
      props.onMaximize(panelId);
    };
  }

  function popoutPanel(panelId: PanelId) {
    return () => {
      // Fire-and-forget: the engine resolves false when the browser blocks
      // window.open — nothing to surface, the dock simply stays as-is.
      void engine?.popoutPanel(panelId);
    };
  }

  // Attached only while no maximize is live (spec §3.2, Ruling 32): a float
  // while a strip owns the grid has no coherent home, the engine refuses it
  // (R3), and a control that does nothing is worse than none. Withheld on
  // EVERY head — a floating panel's "Dock" included, since docking into a
  // maximize-owned grid lands it in the same incoherent spot.
  function floatOrDockPanel(panelId: PanelId) {
    return () => {
      if (floating().includes(panelId)) {
        engine?.dockPanel(panelId);
        return;
      }

      engine?.floatPanel(panelId);
    };
  }

  function closeInstancePanel(panelId: PanelId) {
    return () => {
      props.onCloseInstance(panelId);
    };
  }

  // Only a chart instance's head gets the close control — a static panel
  // closes through the View menu, a Jarvis-docked one through its own head.
  // Read at the JSX use site (a reactive prop getter), so the actions slot
  // itself never remounts when the instance set changes.
  function isOpenInstance(panelId: PanelId): boolean {
    return props.instances.some((instance) => {
      return instance.id === panelId;
    });
  }

  function expandOrRestorePanel(panelId: PanelId) {
    return () => {
      if (props.collapsed.includes(panelId)) {
        props.onExpand(panelId);
      } else {
        props.onRestore();
      }
    };
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
      // group AT MOUNT TIME (see `DockDynamicPanel`'s doc: "never stacked
      // into an existing group"), so that group's own DOM root doubles, at
      // that moment, as the shared `panel-<id>` leaf testid
      // `InhouseLayoutEngine`'s `PanelLeaf` carries — the one `jarvis.ts`'s
      // `waitForPanelDockedLive`/`isPanelDocked` key on, engine-
      // agnostically. Dockview itself never gives a single DOM node
      // spanning both the tab (head, holding the unpin control) and
      // content (body) slots — they're separate subtrees it manages — so
      // this reaches for the one ancestor dockview DOES share between
      // them: `.dv-groupview`, the same internal class name `Layout.ts`'s
      // drag helper already keys off (`.dv-tab`). A no-op for a static
      // panel (never in `props.docked`), whose group may legitimately be
      // shared/stacked with siblings. Reading `props.docked` here (rather
      // than a ref, react's twin) is correct for the same reason `titleOf`/
      // `specs()` above read straight through the reactive prop getter.
      //
      // RESIDUAL, deliberately not fixed: the tag is a snapshot of "solo at
      // mount", not a live truth. Dockview's cross-group drag-and-drop is
      // live in this app, so a later drag CAN make it stale — dragging this
      // panel into another group leaves the tag on a group it no longer
      // occupies, and dragging a second docked panel to MERGE into THIS
      // one's group overwrites the tag, losing it for this panel entirely.
      // The real fix — tagging the panel's own wrapper instead of its
      // (possibly shared) group ancestor — isn't taken: the tag exists only
      // for the docked-panel e2e/PO witnesses, and today's product never
      // combines "docked via Jarvis" with "then dragged" in the flow those
      // witnesses exercise. The disposer below only keeps the COMMON case
      // (dock → undock, no drag in between) honest, via a direct reference
      // to the exact node tagged here — never re-derived by re-querying
      // `.dv-groupview` at dispose time, which could resolve to a DIFFERENT
      // (or no) group after a drag moved this panel — and cleared only if
      // it still names THIS panel, so a drag-merge that already overwrote
      // it with another panel's id is never wrongly erased.
      let taggedGroup: HTMLElement | null = null;

      if (props.docked.includes(panelId)) {
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

  // The collapse set last pushed into the engine — diffed against, not
  // re-asserted (see the collapse effect below). RESET to `[]` whenever the
  // engine is rebuilt (a fresh engine has nothing collapsed, whatever this
  // said). No tab bookkeeping, unlike the react twin: the caller mounts one
  // of these per tab (see the seed comment above), so a tab SWITCH destroys
  // this component and `applied` starts empty alongside the fresh engine —
  // only a same-tab workspace RESET needs this reset explicitly, since that
  // rebuilds the engine without destroying the component.
  let applied: readonly PanelId[] = [];
  // The docked set last pushed into the engine, mirroring `applied` above
  // (same reset-on-rebuild rule, same reason).
  let appliedDocked: readonly PanelId[] = [];
  // The chart-instance ids last pushed into the engine — `appliedDocked`'s
  // twin on its own channel (same reset-on-rebuild rule), so the instance
  // diff effect below can never act on a Jarvis-docked id.
  let appliedInstances: readonly PanelId[] = [];

  function buildEngine(): void {
    if (containerEl === undefined) {
      return;
    }

    engine = createDockEngine({
      container: containerEl,
      // Setup-scope read is correct here: the keyed <Show> in App remounts
      // this component per tab, so `props.tab` never changes within one
      // instance's lifetime — mirrors LayoutEngineHost's identical read.
      seed: createDefaultLayoutPort(props.tab).initial.root,
      blob: props.store.load(props.tab),
      panels: {
        // Read through the `props` getter on every call, so the engine sees
        // the CURRENT specs (rebuilt by WorkspaceEngine on every render)
        // without this component ever rebuilding the engine — the engine
        // lives for the tab, exactly as react's specsRef keeps it alive
        // there; only a rebuild (a workspace reset) or remount (a tab
        // switch) creates a new one.
        title: (id: string): string => {
          return titleOf(id as PanelId);
        },
        // The in-house maximizeBoundaryPath reads the same spec field: rail
        // panels fill their own column, everything else the whole dock.
        maximizeScope: (id: string): DockMaximizeScope => {
          return specs()[id as PanelId]?.maximizeScope ?? "root";
        },
        mount: mountInto("body"),
        mountTab: mountInto("tab"),
        mountActions: mountInto("actions"),
      },
      onLayoutChange: (blob: string): void => {
        // See the SUPPRESSION GUARD doc above the component.
        if (suppressSave) {
          return;
        }

        props.store.save(props.tab, blob);
        setGroups(engine?.groupCount() ?? 0);
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
      // Read at CONSTRUCTION time only — like react's `dockedRef` /
      // `instancesRef` construction reads — reconciled once here; every later render is
      // handled by the docked and instance diff effects below instead. Both
      // channels MUST be listed: an unlisted dynamic id the blob restored is
      // deleted as an orphan, so an instance missing here loses its blob
      // position.
      dynamicPanels: dynamicPanelsOf(props.docked, props.instances),
    });
    applied = [];
    appliedDocked = [];
    appliedInstances = [];
    setGroups(engine.groupCount());
    setLiveEngine(engine);
    // Hands the controller a source that reads the LIVE engine at call time —
    // closing over the outer `engine` variable, never a value captured by
    // this call, so a save arriving after a LATER rebuild reads whichever
    // engine is current then (the react twin's `engineRef.current` read,
    // ported to Solid's plain-variable idiom; see its own doc above `engine`'s
    // declaration for why a plain variable is the correct read here too).
    props.onSnapshotSourceChange?.(props.tab, (): string => {
      return engine?.snapshotLayout() ?? "";
    });
  }

  onMount(() => {
    buildEngine();
  });

  onCleanup(() => {
    // Null BEFORE disposing: dispose() synchronously flushes a final layout
    // serialization through onLayoutChange's `engine?.groupCount() ?? 0`
    // read, so both must already read null/empty at that point — mirrors
    // react's cleanup ordering (engineRef.current = null, setLiveEngine(null)
    // before engine.dispose()), keeping the two bridges' dispose-time
    // behaviour identical rather than just their steady-state behaviour.
    const disposed = engine;
    engine = null;
    setLiveEngine(null);
    // Unregister BEFORE disposing: a save triggered between this line and
    // `dispose()` must find no source at all, never one that reads a
    // torn-down engine — the react twin's identical cleanup ordering.
    props.onSnapshotSourceChange?.(props.tab, null);
    disposed?.dispose();
  });

  // Rebuilds the engine IN PLACE when the workspace-reset counter bumps —
  // see the REBUILD CONTRACT + SUPPRESSION GUARD docs on the component.
  //
  // What actually makes this correct is NOT this effect's position relative
  // to the maximize/docked/collapse effects below (Solid re-runs UPDATE
  // effects in signal-WRITE order, not declaration order — measured; an
  // earlier version of this comment claimed "declared first ⇒ runs first",
  // which is false). It is, instead: (1) `applied`/`appliedDocked` are reset
  // to `[]` INSIDE this effect, so whenever the collapse/docked effects DO
  // run against the fresh engine, they diff against an empty baseline, not a
  // stale one; (2) `buildEngine()`'s own construction-time `dynamicPanels`
  // reconciliation reads `props.docked` directly, restoring docked
  // membership even on a tick where `props.docked` itself never changed
  // value (so that effect need not re-run at all for docking to survive);
  // and (3) `setLiveEngine` inside `buildEngine()` gives the maximize/
  // collapse effects a signal-write to react to, so THEY re-run and re-apply
  // `maximized`/`collapsed` onto the fresh engine regardless of whether
  // those props themselves changed this tick — the same re-apply react's
  // `liveEngine` state provides there.
  //
  // `on()` without `defer`, per the README's "bookkeeping createEffect"
  // idiom: the mount-time call compares `layoutResets` against itself
  // (`previous ?? current`), a deliberate no-op that also seeds `previous`
  // for the first REAL bump — no `layoutResets === undefined` special case
  // needed. The onMount effect above already built the engine for THIS run.
  createEffect(
    on(
      () => {
        return props.layoutResets;
      },
      (resets, previousResets) => {
        if ((previousResets ?? resets) === resets) {
          return;
        }

        suppressSave = true;

        // MINOR (fix round 2): `try`/`finally` around the whole dispose-
        // then-rebuild span — a throwing `createDockEngine` (or a throwing
        // old engine `dispose()`) must not leave `suppressSave` stuck
        // `true` for the rest of the session, silently dropping every
        // later save.
        try {
          const disposed = engine;
          engine = null;
          setLiveEngine(null);
          // Unregister BEFORE disposing the outgoing engine — the
          // onCleanup's identical ordering above, and for the identical
          // reason: a save triggered by the dispose flush below must find
          // no source at all, never one that would read the torn-down
          // engine.
          props.onSnapshotSourceChange?.(props.tab, null);
          disposed?.dispose();
          setMounted([]);
          setGroups(0);
          setStrips({});
          // Popped state clears with the engine that owned those windows.
          // The rebuilt engine will NOT re-announce an empty set: its
          // `publishPoppedPanels` starts at `lastPopped = []` and only fires
          // on a CHANGE, so a fresh engine with no popouts is silent —
          // leaving a stale `poppedHere` to grey a docked panel's controls
          // forever. Same reason `setStrips({})` sits directly above.
          setPopped([]);
          // A reset rebuilds from the tab's now-CLEARED blob (a fresh
          // default seed), so any panel that was floating cannot still be —
          // clear it proactively for the identical reason `setPopped([])`
          // does: the fresh engine's own `publishFloatingPanels` starts at
          // `lastFloating = []` and fires only on a CHANGE, so a fresh dock
          // with no floats is silent, and without this the stale
          // `floatingHere` would hide collapse/maximize on a panel that is
          // no longer floating anywhere.
          setFloating([]);
          applied = [];
          appliedDocked = [];
          appliedInstances = [];
          buildEngine();
        } finally {
          suppressSave = false;
        }
      },
    ),
  );

  createEffect(() => {
    const currentEngine = liveEngine();
    const maximized = props.maximized;

    if (currentEngine === null) {
      return;
    }

    if (maximized !== null) {
      currentEngine.maximizePanel(maximized);
    } else {
      currentEngine.exitMaximize();
    }
  });

  // The docked set is a SET, not a single id, so — like `collapsed` below —
  // this diffs against the last applied list rather than re-asserting the
  // whole thing every render. Reading `liveEngine()` (not the plain `engine`
  // variable) is what lets this effect re-run on a REBUILD even when
  // `props.docked` itself is unchanged — see the reset effect's doc. The
  // initial pass over a freshly built engine re-adds ids already present via
  // construction-time `dynamicPanels` reconciliation — safe, since
  // `addDynamicPanel` no-ops on an existing id.
  createEffect(() => {
    const currentEngine = liveEngine();
    const docked = props.docked;

    if (currentEngine === null) {
      return;
    }

    for (const panelId of docked) {
      if (!appliedDocked.includes(panelId)) {
        currentEngine.addDynamicPanel({
          id: panelId,
          initialPx: DOCK_COLUMN_INITIAL_PX,
        });
      }
    }

    for (const panelId of appliedDocked) {
      if (!docked.includes(panelId)) {
        currentEngine.removeDynamicPanel(panelId);
      }
    }

    appliedDocked = docked;
  });

  // The layout machine's chart instances — the docked effect's twin on its
  // own channel, declared beside it (before the collapse effect, which may
  // name an instance). Removal only ever walks `appliedInstances`, never
  // `appliedDocked`, and `isInstanceId` refuses any id outside the
  // `eq-chart:` namespace, so dropping an instance can never take a
  // Jarvis-docked panel with it. Reading `liveEngine()` re-runs this on a
  // rebuild, exactly like the docked effect.
  createEffect(() => {
    const currentEngine = liveEngine();
    const instanceIds = instanceIdsOf(props.instances);

    if (currentEngine === null) {
      return;
    }

    for (const panelId of instanceIds) {
      if (!appliedInstances.includes(panelId)) {
        currentEngine.addDynamicPanel(instancePanelOf(panelId));
      }
    }

    for (const panelId of appliedInstances) {
      if (!instanceIds.includes(panelId) && isInstanceId(panelId)) {
        currentEngine.removeDynamicPanel(panelId);
      }
    }

    appliedInstances = instanceIds;
  });

  // `collapsed` is a SET, not a single id like `maximized`, so this diffs
  // against the last applied list rather than re-asserting the whole thing:
  // `collapsePanel` remembers the pre-collapse geometry on the FIRST call for
  // a panel, so blanket-reapplying is safe but pointless work every render.
  createEffect(() => {
    const currentEngine = liveEngine();
    const collapsed = props.collapsed;

    if (currentEngine === null) {
      return;
    }

    for (const panelId of collapsed) {
      if (!applied.includes(panelId)) {
        currentEngine.collapsePanel(panelId);
      }
    }

    for (const panelId of applied) {
      if (!collapsed.includes(panelId)) {
        currentEngine.expandPanel(panelId);
      }
    }

    applied = collapsed;
  });

  // The WHOLE set of this tab's panels living outside the grid (floating or
  // popped out), reported on every change so a Jarvis layout command on one
  // is refused with a reason rather than recorded as a machine intent the
  // engine will never apply (the engine refuses collapse/maximize on a
  // detached panel). The react twin's effect, split in two the Solid way:
  // the effect re-reports on every `floating`/`popped` write, and the
  // component-level cleanup reports `[]` — on unmount the engine, and every
  // window/float it owned, is gone, so nothing is detached any more.
  createEffect(() => {
    props.onDetachedPanelsChange?.(props.tab, [...floating(), ...popped()]);
  });

  onCleanup(() => {
    props.onDetachedPanelsChange?.(props.tab, []);
  });

  // The closed set reconciles rather than diffs: closePanel no-ops on an
  // absent panel and reopenPanel on a present one, so re-asserting the whole
  // seed set is already idempotent — every rebuild path (remount, blob saved
  // while closed) converges on the machine's state with no bookkeeping.
  //
  // Reads the LIVE `liveEngine()` signal, not the plain `engine` variable
  // the way this effect used to (Task 10, saved-layouts e2e): the plain
  // variable is written imperatively outside Solid's reactive graph, so an
  // engine rebuild alone never re-ran this effect, only ever the SAME tick a
  // `closed` value also happened to change — the react twin's identical
  // effect hit exactly this shape of staleness (there, against an already-
  // DISPOSED engine) badly enough to crash dockview-core's `_doAddPanel`;
  // reading the signal here is the parallel hardening, matching every OTHER
  // engine-dependent effect above (maximize/docked/instances/collapsed all
  // read `liveEngine()` already).
  createEffect(() => {
    const currentEngine = liveEngine();
    const closed = props.closed;

    if (currentEngine === null) {
      return;
    }

    for (const panelId of seedPanelIdsOf(
      createDefaultLayoutPort(props.tab).initial.root,
    )) {
      if (closed.includes(panelId)) {
        currentEngine.closePanel(panelId);
      } else {
        currentEngine.reopenPanel(panelId);
      }
    }
  });

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
      data-groups={groups()}
      data-maximized={props.maximized ?? ""}
      data-collapsed={props.collapsed.join(" ")}
      data-closed={props.closed.join(" ")}
      data-popped={popped().join(" ")}
      data-floating={floating().join(" ")}
      data-instances={instanceIdsOf(props.instances).join(" ")}
      class={styles.engine}
    >
      <div ref={containerEl} class={`${styles.container} dockview-theme-rtc`} />
      <For each={mounted()}>
        {(p: MountedSlot): JSX.Element => {
          // `p.slot` / `p.panelId` are fixed for the row's lifetime (a slot
          // is one dockview element; <For> keys rows by reference), so the
          // slot branch is a plain setup-time conditional — only the strip
          // state, the title and the head/registry lookups are reactive.
          function strip(): DockStripOrientation | undefined {
            return strips()[p.panelId];
          }

          // PER-SLOT MEMOIZED LOOKUP (fix round 1): App hands this bridge a
          // registry of NEW identity whenever the instance set changes, and
          // a tracked `props.registry[id]?.()` would re-run EVERY mounted
          // panel's factory on it — a remount (DOM, component state, stream
          // subscriptions) for panels that never changed. A memo per slot
          // compares the ENTRY by reference, so only a slot whose own entry
          // changed re-renders. React needs no twin: its portals reconcile
          // the same element tree in place. Created in the branch that uses
          // it, so a slot only ever owns the memo it reads.

          if (p.slot === "tab") {
            const headEntry = createMemo(() => {
              return props.headRegistry?.[p.panelId];
            });
            // `data-dock-strip` tells dockview-hud.css to hide the whole
            // group header while the panel is a strip — the strip bar in
            // the body slot is the panel's entire chrome then, as in-house.
            return (
              <Portal mount={p.element}>
                <div
                  data-testid={`dock-tab-${p.panelId}`}
                  data-panel-title={titleOf(p.panelId)}
                  data-dock-strip={strip() === undefined ? "false" : "true"}
                  class={styles.tabSlot}
                >
                  <Show when={strip() === undefined}>
                    <PanelHeadSlot
                      panelId={p.panelId}
                      title={titleOf(p.panelId)}
                      headContent={headEntry()}
                    />
                  </Show>
                </div>
              </Portal>
            );
          }

          if (p.slot === "actions") {
            // The two conditional slots are memos made HERE, in the row's
            // setup scope (inside <For>'s root). Written inline as
            // `onFloat={cond ? fn : undefined}`, Solid compiles the ternary
            // into a memo created inside the prop's GETTER — and the control
            // reads that getter from its click handler, outside any root:
            // one never-disposed computation per click, dev-warned
            // "computations created outside a createRoot" (Ruling 39).
            // Reading a memo outside a root creates nothing.
            const floatHandler = createMemo(() => {
              return props.maximized === null
                ? floatOrDockPanel(p.panelId)
                : undefined;
            });

            const closeHandler = createMemo(() => {
              return isOpenInstance(p.panelId)
                ? closeInstancePanel(p.panelId)
                : undefined;
            });

            return (
              <Portal mount={p.element}>
                <Show when={strip() === undefined}>
                  <PanelHeadControls
                    panelId={p.panelId}
                    title={titleOf(p.panelId)}
                    maximizable={specs()[p.panelId]?.maximizable !== false}
                    maximizedHere={props.maximized === p.panelId}
                    poppedHere={popped().includes(p.panelId)}
                    floatingHere={floating().includes(p.panelId)}
                    onCollapse={collapsePanel(p.panelId)}
                    onMaximize={maximizePanel(p.panelId)}
                    onRestore={props.onRestore}
                    onPopout={popoutPanel(p.panelId)}
                    onFloat={floatHandler()}
                    onClose={closeHandler()}
                  />
                </Show>
              </Portal>
            );
          }

          const bodyEntry = createMemo(() => {
            return props.registry[p.panelId];
          });

          return (
            <Portal mount={p.element}>
              <Show
                when={strip()}
                fallback={
                  // data-flip-stage: the scroll container owning the panel's
                  // visible height — the FLIP grid's enter sweep anchors to
                  // its corner.
                  <div class={styles.panelBody} data-flip-stage>
                    {/* Solid's compiler lowers this dynamic `title` attribute
                     * to a `get title()` accessor on PanelErrorBoundary's
                     * props, so it only runs when PanelErrorBoundary's own
                     * fallback reads it — which happens only after a panel
                     * body throws. No DockviewEngine.contract.spec.ts case
                     * crashes a panel, so this getter is a coverage artifact
                     * (defined, never invoked) rather than an untested code
                     * path — the fallback render itself is exercised by
                     * InhouseLayoutEngine.smoke.test.tsx's error-boundary
                     * case. */}
                    <PanelErrorBoundary title={titleOf(p.panelId)}>
                      {bodyEntry()?.()}
                    </PanelErrorBoundary>
                  </div>
                }
              >
                {(orientation: Accessor<DockStripOrientation>): JSX.Element => {
                  return (
                    <PanelStrip
                      panelId={p.panelId}
                      title={titleOf(p.panelId)}
                      orientation={orientation()}
                      // A strip is either the user's (in `collapsed` →
                      // expand it) or one the maximize forced (→ restore
                      // the maximize), exactly the in-house PanelLeaf's
                      // branch.
                      onRestore={expandOrRestorePanel(p.panelId)}
                    />
                  );
                }}
              </Show>
            </Portal>
          );
        }}
      </For>
    </main>
  );
}

export interface DockviewLayoutEngineProps {
  tab: WorkspaceTab;
  registry: PanelRegistry;
  headRegistry?: Partial<Record<PanelId, () => JSX.Element>>;
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
   * no-op-safe. */
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
   * the tab's now-cleared blob — see the component's REBUILD CONTRACT doc
   * for why this is a prop here rather than a caller-side keyed remount like
   * the react twin used before fix round 1 (both bridges now rebuild via
   * this prop, not a `key`). */
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
}

type StripMap = Partial<Record<PanelId, DockStripOrientation>>;

/** The construction-time `dynamicPanels` for `buildEngine` (at mount and on
 * every `layoutResets` rebuild): Jarvis-docked panels pinned at their design
 * width like a seeded rail, chart instances via {@link instancePanelOf}. */
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
