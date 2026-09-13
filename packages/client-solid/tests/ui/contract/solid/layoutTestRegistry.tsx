import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";

/** Shared fake-panel map for the contract tier's two layout-engine hosts
 * (LayoutEngineHost for the in-house engine, DockviewEngineHost for the
 * Dockview bridge, Task 5) — both must exercise identical panel content so
 * their respective contract specs' assertions are comparable. Kept in its
 * own module (mirrors client-react's layoutTestRegistry.tsx byte-for-byte)
 * so both hosts share one source of truth. */
export const layoutTestRegistry: PanelRegistry = {
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
  "credit-rfqs": () => {
    return <div data-testid="credit-rfqs-body">RFQS</div>;
  },
  "credit-blotter": () => {
    return <div data-testid="credit-blotter-body">CREDIT BLOTTER</div>;
  },
  "admin-throughput": () => {
    return <div data-testid="admin-throughput-body">ADMIN</div>;
  },
  // The Task 7 docked-fixture panel: a stand-in for a real Jarvis desk panel
  // once it's docked into a tab (id shape mirrors DOCKED_PANEL_ID in
  // LayoutEngine.contract.spec.ts, "panel-<name>"). Rendering one of
  // PANEL_RENDERER_TESTIDS (JarvisPanelLayerPage) instead of a bare `-body`
  // div lets DockviewEngine.contract.spec.ts's docked cases assert the same
  // renderer-testid witness the world-driven docked specs use for a real
  // desk panel's body.
  "panel-desk-heat": () => {
    return <div data-testid="jarvis-panel-heatmap">DESK HEAT</div>;
  },
};
