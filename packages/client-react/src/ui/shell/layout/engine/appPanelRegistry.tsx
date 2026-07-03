import { AdminDashboard } from "#/ui/admin/AdminDashboard";
import { CreditBlotter } from "#/ui/credit/blotter/CreditBlotter";
import { CreditWorkspace } from "#/ui/credit/CreditWorkspace";
import { EquitiesPanel } from "#/ui/equities/EquitiesPanel";
import { AnalyticsPanel } from "#/ui/fx/analytics/AnalyticsPanel";
import { FxBlotter } from "#/ui/fx/blotter/FxBlotter";
import { LiveRatesPanel } from "#/ui/fx/liveRates/LiveRatesPanel";
import { PositionsPanel } from "#/ui/fx/positions/PositionsPanel";

import type { PanelRegistry } from "./panelRegistry";

/** The real id→module-root map. Panel ids are owned by defaultLayoutPort;
 * each maps to the same module root Workspace.tsx imported before the engine. */
export const appPanelRegistry: PanelRegistry = {
  "fx-rates": () => {
    return <LiveRatesPanel />;
  },
  "fx-analytics": () => {
    return <AnalyticsPanel />;
  },
  "fx-positions": () => {
    return <PositionsPanel />;
  },
  "fx-blotter": () => {
    return <FxBlotter />;
  },
  "credit-rfqs": () => {
    return <CreditWorkspace />;
  },
  "credit-blotter": () => {
    return <CreditBlotter />;
  },
  "admin-dashboard": () => {
    return <AdminDashboard />;
  },
  equities: () => {
    return <EquitiesPanel />;
  },
};
