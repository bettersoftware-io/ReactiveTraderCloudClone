import { AnalyticsPanel } from "#/ui/fx/analytics/AnalyticsPanel";
import { FxBlotter } from "#/ui/fx/blotter/FxBlotter";
import { LiveRatesPanel } from "#/ui/fx/liveRates/LiveRatesPanel";
import { PositionsPanel } from "#/ui/fx/positions/PositionsPanel";

import type { PanelRegistry } from "./panelRegistry";

/** The real id→module-root map. Panel ids are owned by defaultLayoutPort;
 * each maps to the same module root the react `appPanelRegistry.tsx` uses.
 *
 * FX-only so far (Task 13): Credit/Equities/Admin panel modules don't exist
 * in `@rtc/client-solid` yet — their entries land with Tasks 14-16, mirroring
 * the react registry's full id set at that point. Until then, App.tsx keeps
 * every non-FX tab on its own `pending-panel` placeholder rather than
 * mounting this registry for them. */
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
};
