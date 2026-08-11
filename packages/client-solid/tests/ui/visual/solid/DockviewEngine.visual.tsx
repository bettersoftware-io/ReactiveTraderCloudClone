import type { JSX } from "solid-js";

import { InMemoryDockLayoutStore } from "@rtc/client-core";

import { DockviewLayoutEngine } from "#/ui/shell/layout/dockview/DockviewLayoutEngine";
import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";

import styles from "./DockviewEngine.visual.module.css";

/**
 * Golden-only wrapper for the Dockview engine bridge (Task 7, spec
 * 2026-08-11-dockview-layout-engine, Solid twin of client-react's
 * DockviewEngine.visual.tsx): the dockview chrome — tabs, group borders,
 * sashes — over static panel stubs, themed by the HUD variable mapping in
 * `@rtc/layout-dockview/styles/dockview-hud.css`. The 10-combo theme matrix is
 * the chrome theming's pixel witness; real panel content is the in-house
 * engine scenarios' job, not this one's.
 *
 * Deterministic by construction: a fresh `InMemoryDockLayoutStore` per mount
 * (so `store.load("fx")` returns `null` — the seed-render path, never a
 * persisted blob), `maximized: null`, and a 4-panel `fx`-tab-only registry
 * duplicated (not imported) from the contract tier's `layoutTestRegistry`
 * (`tests/ui/contract/solid/layoutTestRegistry.tsx`) — each visual wrapper
 * stays self-contained per client, same convention as client-react's twin.
 * No timers, no randomness: `createDockEngine` lays out synchronously from
 * `createDefaultLayoutPort("fx").initial.root` on mount. A Solid component
 * body runs once, so the plain `new InMemoryDockLayoutStore()` below (unlike
 * react's build-once ref) is already build-once by construction.
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

export function DockviewEngineVisual(): JSX.Element {
  const store = new InMemoryDockLayoutStore();

  return (
    <div class={styles.stage}>
      <DockviewLayoutEngine
        tab="fx"
        registry={visualDockPanelRegistry}
        store={store}
        maximized={null}
      />
    </div>
  );
}
