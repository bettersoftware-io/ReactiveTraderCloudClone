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
};
