import { AdminPanel } from "#/ui/admin/AdminPanel";
import { CreditBlotter } from "#/ui/credit/blotter/CreditBlotter";
import { CreditWorkspace } from "#/ui/credit/CreditWorkspace";
import { EquitiesPanel } from "#/ui/equities/EquitiesPanel";
import { AnalyticsPanel } from "#/ui/fx/analytics/AnalyticsPanel";
import { FxBlotter } from "#/ui/fx/blotter/FxBlotter";
import { LiveRatesPanel } from "#/ui/fx/liveRates/LiveRatesPanel";

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
  "fx-blotter": () => {
    return <FxBlotter />;
  },
  "credit-rfqs": () => {
    return <CreditWorkspace />;
  },
  "credit-blotter": () => {
    return <CreditBlotter />;
  },
  "admin-throughput": () => {
    return <AdminPanel />;
  },
  equities: () => {
    return <EquitiesPanel />;
  },
};
