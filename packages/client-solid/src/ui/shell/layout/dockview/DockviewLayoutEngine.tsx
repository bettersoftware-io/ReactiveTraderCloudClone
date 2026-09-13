import {
  type Accessor,
  createEffect,
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
 * `applied`/`appliedDocked` to their initial values before calling the SAME
 * `buildEngine()` the initial `onMount` uses, from the tab's now-cleared
 * blob.
 *
 * SUPPRESSION GUARD (fix round 1, review Critical C1): `createDockEngine`'s
 * `dispose()` unconditionally flushes one final serialize, even mid-rebuild
 * — without a guard, that flush would call `props.store.save` with the OLD
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
      // Read at CONSTRUCTION time only — like react's `dockedRef.current` —
      // reconciled once here; every later render is handled by the docked
      // diff effect below instead.
      dynamicPanels: props.docked.map((panelId) => {
        return { id: panelId, initialPx: DOCK_COLUMN_INITIAL_PX };
      }),
    });
    applied = [];
    appliedDocked = [];
    setGroups(engine.groupCount());
    setLiveEngine(engine);
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
          disposed?.dispose();
          setMounted([]);
          setGroups(0);
          setStrips({});
          applied = [];
          appliedDocked = [];
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

  // `data-collapsed` witnesses that the collapse set reached this bridge —
  // identically for both clients — while the strip itself is a real
  // `PanelStrip` in the body slot, just as in-house.
  return (
    <main
      data-testid="layout-engine"
      data-engine="dockview"
      data-groups={groups()}
      data-collapsed={props.collapsed.join(" ")}
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

          if (p.slot === "tab") {
            // `data-dock-strip` tells dockview-hud.css to hide the whole
            // group header while the panel is a strip — the strip bar in
            // the body slot is the panel's entire chrome then, as in-house.
            return (
              <Portal mount={p.element}>
                <div
                  data-testid={`dock-tab-${p.panelId}`}
                  data-dock-strip={strip() === undefined ? "false" : "true"}
                  class={styles.tabSlot}
                >
                  <Show when={strip() === undefined}>
                    <PanelHeadSlot
                      panelId={p.panelId}
                      title={titleOf(p.panelId)}
                      headContent={props.headRegistry?.[p.panelId]}
                    />
                  </Show>
                </div>
              </Portal>
            );
          }

          if (p.slot === "actions") {
            return (
              <Portal mount={p.element}>
                <Show when={strip() === undefined}>
                  <PanelHeadControls
                    panelId={p.panelId}
                    title={titleOf(p.panelId)}
                    maximizable={specs()[p.panelId]?.maximizable !== false}
                    maximizedHere={props.maximized === p.panelId}
                    onCollapse={collapsePanel(p.panelId)}
                    onMaximize={maximizePanel(p.panelId)}
                    onRestore={props.onRestore}
                  />
                </Show>
              </Portal>
            );
          }

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
                      {props.registry[p.panelId]?.()}
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
  /** The active tab's layer-2 docked set — membership only; arrangement lives
   * in the blob. Reconciled into the engine at construction (as
   * `dynamicPanels`) and diffed against on every later render, mirroring how
   * `collapsed` is handled. */
  docked: readonly PanelId[];
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
}

interface MountedSlot {
  readonly panelId: PanelId;
  readonly element: HTMLElement;
  /** Which dockview-owned element this is: the panel body, the panel's tab
   * (head slot), or its group's right-hand actions slot (controls). */
  readonly slot: "body" | "tab" | "actions";
}

type StripMap = Partial<Record<PanelId, DockStripOrientation>>;
