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
 * each maps to the same module root the react `appPanelRegistry.tsx` uses.
 *
 * FX + Equities so far (Tasks 13/15): Credit/Admin panel modules don't exist
 * in `@rtc/client-solid` yet — their entries land with Tasks 14/16, mirroring
 * the react registry's full id set at that point. Until then, App.tsx keeps
 * every non-FX/non-equities tab on its own `pending-panel` placeholder rather
 * than mounting this registry for them. */
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
