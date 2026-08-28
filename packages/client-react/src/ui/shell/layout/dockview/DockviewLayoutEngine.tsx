import { type ReactElement, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
 * layout is an opaque blob per tab. */
export function DockviewLayoutEngine({
  tab,
  registry,
  headRegistry,
  specs = PANEL_SPECS,
  store,
  maximized,
  collapsed,
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
  // from the axis its group's siblings run along (see createDockEngine's
  // collapsePanel), so the bridge cannot second-guess it.
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

  // Synced in an effect (not during render — React Compiler forbids touching
  // refs there); declared BEFORE the engine effect so it runs first and the
  // engine's title hook always sees the current specs.
  useEffect(() => {
    specsRef.current = specs;
  });

  useEffect(() => {
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
        mount: mountInto("body"),
        mountTab: mountInto("tab"),
        mountActions: mountInto("actions"),
      },
      onLayoutChange: (blob: string): void => {
        store.save(tab, blob);
        setGroups(engineRef.current?.groupCount() ?? 0);
      },
    });
    engineRef.current = engine;
    setGroups(engine.groupCount());

    return () => {
      engineRef.current = null;
      setMounted([]);
      engine.dispose();
    };
  }, [tab, store]);

  useEffect(() => {
    const engine = engineRef.current;

    if (engine === null) {
      return;
    }

    if (maximized !== null) {
      engine.maximizePanel(maximized);
    } else {
      engine.exitMaximize();
    }
  }, [maximized]);

  // `collapsed` is a SET, not a single id like `maximized`, so this diffs
  // against the last applied list rather than re-asserting the whole thing:
  // `collapsePanel` remembers the pre-collapse geometry on the FIRST call for a
  // panel, so blanket-reapplying is safe but pointless work every render.
  // `tab` is a dep because switching tabs rebuilds the engine — the new one has
  // nothing collapsed, so the previously-applied list must reset with it or the
  // diff would skip re-collapsing panels the fresh engine has never seen.
  const appliedCollapse = useRef<AppliedCollapse>({ tab, ids: [] });

  useEffect(() => {
    const engine = engineRef.current;

    if (engine === null) {
      return;
    }

    const previous =
      appliedCollapse.current.tab === tab ? appliedCollapse.current.ids : [];
    const next: StripMap = {};

    for (const panelId of collapsed) {
      if (!previous.includes(panelId)) {
        const orientation = engine.collapsePanel(panelId);

        if (orientation !== null) {
          next[panelId] = orientation;
        }
      }
    }

    for (const panelId of previous) {
      if (!collapsed.includes(panelId)) {
        engine.expandPanel(panelId);
      }
    }

    appliedCollapse.current = { tab, ids: collapsed };
    setStrips((prev) => {
      const kept: StripMap = {};

      for (const panelId of collapsed) {
        const orientation = next[panelId] ?? prev[panelId];

        if (orientation !== undefined) {
          kept[panelId] = orientation;
        }
      }

      return kept;
    });
  }, [collapsed, tab]);

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
                onCollapse={() => {
                  onCollapse(panelId);
                }}
                onMaximize={() => {
                  onMaximize(panelId);
                }}
                onRestore={onRestore}
              />
            ) : null
          ) : strip !== undefined ? (
            <PanelStrip
              panelId={panelId}
              title={title}
              orientation={strip}
              onRestore={() => {
                onExpand(panelId);
              }}
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
