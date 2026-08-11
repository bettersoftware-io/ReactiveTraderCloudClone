import { type ReactElement, useRef } from "react";

import {
  type DockLayoutStore,
  InMemoryDockLayoutStore,
} from "@rtc/client-core";

import { DockviewLayoutEngine } from "#/ui/shell/layout/dockview/DockviewLayoutEngine";
import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";

import styles from "./DockviewEngine.visual.module.css";

/**
 * Golden-only wrapper for the Dockview engine bridge (Task 7, spec
 * 2026-08-11-dockview-layout-engine): the dockview chrome — tabs, group
 * borders, sashes — over static panel stubs, themed by the HUD variable
 * mapping in `@rtc/layout-dockview/styles/dockview-hud.css`. The 10-combo
 * theme matrix is the chrome theming's pixel witness; real panel content is
 * the in-house engine scenarios' job, not this one's (mirrors registry.tsx's
 * `staticEngine`/`visualPanelRegistry` precedent for `layout/fx-*`).
 *
 * Deterministic by construction: a fresh `InMemoryDockLayoutStore` per mount
 * (so `store.load("fx")` returns `null` — the seed-render path, never a
 * persisted blob), `maximized: null`, and a 4-panel `fx`-tab-only registry
 * duplicated (not imported) from the contract tier's `layoutTestRegistry`
 * (`tests/ui/contract/react/layoutTestRegistry.tsx`) — each visual wrapper
 * stays self-contained per client, same convention as the Equities chart
 * wrappers. No timers, no randomness: `createDockEngine` lays out synchronously
 * from `createDefaultLayoutPort("fx").initial.root` on mount.
 */
const visualDockPanelRegistry: PanelRegistry = {
  "fx-rates": () => {
    return <div data-testid="fx-rates-body">RATES</div>;
  },
  "fx-analytics": () => {
    return <div data-testid="fx-analytics-body">ANALYTICS</div>;
  },
  "fx-positions": () => {
    return <div data-testid="fx-positions-body">POSITIONS</div>;
  },
  "fx-blotter": () => {
    return <div data-testid="fx-blotter-body">BLOTTER</div>;
  },
};

export function DockviewEngineVisual(): ReactElement {
  // Build-once-ref (mirrors DockviewEngineHost.tsx's identical idiom): a
  // fresh, never-persisted-to store per mount, so `store.load("fx")` reads
  // `null` on every capture — the seed-render path — rather than churning a
  // new store (and therefore a dockview engine remount) on every re-render.
  const storeRef = useRef<DockLayoutStore | null>(null);

  if (storeRef.current === null) {
    storeRef.current = new InMemoryDockLayoutStore();
  }

  return (
    <div className={styles.stage}>
      <DockviewLayoutEngine
        tab="fx"
        registry={visualDockPanelRegistry}
        store={storeRef.current}
        maximized={null}
      />
    </div>
  );
}
