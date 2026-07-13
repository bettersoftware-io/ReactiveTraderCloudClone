import type { JSX } from "solid-js";

import type { PanelId } from "@rtc/client-core";

import { AnalyticsHead } from "#/ui/fx/analytics/AnalyticsHead";
import { FxBlotterHead } from "#/ui/fx/blotter/FxBlotterHead";
import { LiveRatesHead } from "#/ui/fx/liveRates/LiveRatesHead";
import { PositionsHead } from "#/ui/fx/positions/PositionsHead";

/** The real id→head-slot map, passed to InhouseLayoutEngine's headRegistry
 * prop. Panel ids without an entry fall back to the engine's default title
 * span. FX-only so far (Task 13) — mirrors `appPanelRegistry.tsx`'s scope;
 * Credit/Equities/Admin entries land with Tasks 14-16. */
export const appHeadRegistry: Partial<Record<PanelId, () => JSX.Element>> = {
  "fx-rates": () => {
    return <LiveRatesHead />;
  },
  "fx-analytics": () => {
    return <AnalyticsHead />;
  },
  "fx-positions": () => {
    return <PositionsHead />;
  },
  "fx-blotter": () => {
    return <FxBlotterHead />;
  },
};
