import {
  type Accessor,
  createEffect,
  createSignal,
  For,
  type JSX,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import { Portal } from "solid-js/web";

import {
  createDefaultLayoutPort,
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
 * layout is an opaque blob per tab. */
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
  let containerEl: HTMLDivElement | undefined;
  let engine: DockEngine | null = null;

  function specs(): Readonly<Record<PanelId, PanelSpec>> {
    return props.specs ?? PANEL_SPECS;
  }

  function titleOf(panelId: PanelId): string {
    return specs()[panelId]?.title ?? panelId;
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

  onMount(() => {
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
        // there; only a remount (a tab switch) creates a new one.
        title: (id: string): string => {
          return titleOf(id as PanelId);
        },
        mount: mountInto("body"),
        mountTab: mountInto("tab"),
        mountActions: mountInto("actions"),
      },
      onLayoutChange: (blob: string): void => {
        props.store.save(props.tab, blob);
        setGroups(engine?.groupCount() ?? 0);
      },
      onStripsChange: (next: DockStripMap): void => {
        setStrips(next as StripMap);
      },
    });
    setGroups(engine.groupCount());
  });

  onCleanup(() => {
    // Null the ref BEFORE disposing: dispose() synchronously flushes a final
    // layout serialization through onLayoutChange's `engine?.groupCount() ??
    // 0` read, so the ref must already read null at that point — mirrors
    // react's cleanup ordering (engineRef.current = null before
    // engine.dispose()), keeping the two bridges' dispose-time behaviour
    // identical rather than just their steady-state behaviour.
    const disposed = engine;
    engine = null;
    disposed?.dispose();
  });

  createEffect(() => {
    const maximized = props.maximized;

    if (engine === null) {
      return;
    }

    if (maximized !== null) {
      engine.maximizePanel(maximized);
    } else {
      engine.exitMaximize();
    }
  });

  // `collapsed` is a SET, not a single id like `maximized`, so this diffs
  // against the last applied list rather than re-asserting the whole thing:
  // `collapsePanel` remembers the pre-collapse geometry on the FIRST call for
  // a panel, so blanket-reapplying is safe but pointless work every render.
  // No tab bookkeeping here, unlike the React twin: the caller mounts one of
  // these per tab (see the seed comment above), so a tab switch destroys this
  // component and `applied` starts empty alongside the fresh engine.
  let applied: readonly PanelId[] = [];

  createEffect(() => {
    const collapsed = props.collapsed;

    if (engine === null) {
      return;
    }

    for (const panelId of collapsed) {
      if (!applied.includes(panelId)) {
        engine.collapsePanel(panelId);
      }
    }

    for (const panelId of applied) {
      if (!collapsed.includes(panelId)) {
        engine.expandPanel(panelId);
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
                    onCollapse={() => {
                      props.onCollapse(p.panelId);
                    }}
                    onMaximize={() => {
                      props.onMaximize(p.panelId);
                    }}
                    onRestore={() => {
                      props.onRestore();
                    }}
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
                      onRestore={() => {
                        props.onExpand(p.panelId);
                      }}
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
