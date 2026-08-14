import { type ReactElement, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  createDefaultLayoutPort,
  type DockLayoutStore,
  PANEL_SPECS,
  type PanelId,
  type PanelSpec,
  type WorkspaceTab,
} from "@rtc/client-core";
import { createDockEngine, type DockEngine } from "@rtc/layout-dockview";
import "@rtc/layout-dockview/styles/dockview-hud.css";

import { PanelErrorBoundary } from "../engine/PanelErrorBoundary";
import type { PanelRegistry } from "../engine/panelRegistry";

import styles from "./DockviewLayoutEngine.module.css";

/** Dockview-backed workspace engine. Dockview owns geometry (drag, tabs,
 * splits); panel CONTENT stays in the app's React tree via portals so
 * ViewModel/FxView/CreditView contexts flow — a separate root would crash
 * every context consumer. The persisted layout is an opaque blob per tab. */
export function DockviewLayoutEngine({
  tab,
  registry,
  headRegistry,
  specs = PANEL_SPECS,
  store,
  maximized,
  collapsed,
}: DockviewLayoutEngineProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<DockEngine | null>(null);
  const [mounted, setMounted] = useState<readonly MountedPanel[]>([]);
  const [groups, setGroups] = useState(0);

  useEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    const engine = createDockEngine({
      container,
      seed: createDefaultLayoutPort(tab).initial.root,
      blob: store.load(tab),
      panels: {
        title: (id: string): string => {
          return specs[id as PanelId]?.title ?? id;
        },
        mount: (id: string, element: HTMLElement): (() => void) => {
          const panelId = id as PanelId;
          setMounted((prev) => {
            return [...prev, { panelId, element }];
          });

          return () => {
            setMounted((prev) => {
              return prev.filter((p) => {
                return p.element !== element;
              });
            });
          };
        },
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
  }, [tab, store, specs]);

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
  const appliedCollapse = useRef<{
    tab: WorkspaceTab;
    ids: readonly PanelId[];
  }>({ tab, ids: [] });

  useEffect(() => {
    const engine = engineRef.current;

    if (engine === null) {
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
  }, [collapsed, tab]);

  // `data-collapsed` witnesses that the collapse set reached this bridge. The
  // collapse itself is a dockview-internal group size and leaves no DOM trace
  // to assert against — createDockEngine's own tests cover the mechanism, this
  // covers the wiring, identically for both clients.
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
      {mounted.map(({ panelId, element }) => {
        const head = headRegistry?.[panelId];
        return createPortal(
          <div className={styles.panelBody}>
            {head ? <div className={styles.headStrip}>{head()}</div> : null}
            <PanelErrorBoundary title={specs[panelId]?.title ?? panelId}>
              {registry[panelId]?.()}
            </PanelErrorBoundary>
          </div>,
          element,
          panelId,
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
}

interface MountedPanel {
  readonly panelId: PanelId;
  readonly element: HTMLElement;
}
