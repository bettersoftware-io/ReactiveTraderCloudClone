import { AdminDashboard } from "#/ui/admin/AdminDashboard";
import { CreditBlotter } from "#/ui/credit/blotter/CreditBlotter";
import { CreditWorkspace } from "#/ui/credit/CreditWorkspace";
import { EqBlotterPanel } from "#/ui/equities/blotter/EqBlotterPanel";
import { ChartPanel } from "#/ui/equities/chart/ChartPanel";
import { EqDepthDock } from "#/ui/equities/chart/EqDepthDock";
import { OrderTicket } from "#/ui/equities/ticket/OrderTicket";
import { EqSectorsDock } from "#/ui/equities/watchlist/EqSectorsDock";
import { WatchlistPanel } from "#/ui/equities/watchlist/WatchlistPanel";
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
  "eq-chart": () => {
    return <ChartPanel />;
  },
  "eq-blotter": () => {
    return <EqBlotterPanel />;
  },
  "eq-ticket": () => {
    return <OrderTicket />;
  },
  "eq-watchlist": () => {
    return <WatchlistPanel />;
  },
  // eq-depth / eq-sectors are registered but not placed in the default
  // four-panel tree (they survive outside it, mounted directly by their own
  // contract/visual specs); these dock wrappers feed them the shared
  // eqWorkspace selection for when the app registry does mount them.
  "eq-depth": () => {
    return <EqDepthDock />;
  },
  "eq-sectors": () => {
    return <EqSectorsDock />;
  },
};
