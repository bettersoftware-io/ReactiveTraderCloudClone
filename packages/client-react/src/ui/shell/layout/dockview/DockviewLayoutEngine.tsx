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

  return (
    <main
      data-testid="layout-engine"
      data-engine="dockview"
      data-groups={groups}
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
}

interface MountedPanel {
  readonly panelId: PanelId;
  readonly element: HTMLElement;
}
