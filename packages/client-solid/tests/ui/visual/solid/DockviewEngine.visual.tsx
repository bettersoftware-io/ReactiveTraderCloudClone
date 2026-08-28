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
 *
 * Body copy is deliberately `"FX-RATES-BODY"` etc — NOT the contract tier's
 * plain `"RATES"`/`"ANALYTICS"`/... — because `scenarioActionFor`'s
 * `waitForText` resolves through Playwright's `getByText`, a case-insensitive
 * SUBSTRING match with no `exact` option in `ScenarioAction`. Dockview's own
 * tab title for fx-rates is "Live Rates" (PANEL_SPECS), which contains
 * "Rates" — a plain "RATES" body would strict-mode-violate (2 matches: the
 * stub body AND the tab). The hyphenated all-caps form shares no substring
 * with any PANEL_SPECS title. Solid asserts against react's goldens, so this
 * copy must match client-react's twin exactly.
 */
const visualDockPanelRegistry: PanelRegistry = {
  "fx-rates": () => {
    return <div data-testid="fx-rates-body">FX-RATES-BODY</div>;
  },
  "fx-analytics": () => {
    return <div data-testid="fx-analytics-body">FX-ANALYTICS-BODY</div>;
  },
  "fx-positions": () => {
    return <div data-testid="fx-positions-body">FX-POSITIONS-BODY</div>;
  },
  "fx-blotter": () => {
    return <div data-testid="fx-blotter-body">FX-BLOTTER-BODY</div>;
  },
};

/** The header controls need intent slots; a golden never clicks them. */
function noop(): void {}

export function DockviewEngineVisual(): JSX.Element {
  const store = new InMemoryDockLayoutStore();

  return (
    <div class={styles.stage}>
      <DockviewLayoutEngine
        tab="fx"
        registry={visualDockPanelRegistry}
        store={store}
        maximized={null}
        collapsed={[]}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
      />
    </div>
  );
}
