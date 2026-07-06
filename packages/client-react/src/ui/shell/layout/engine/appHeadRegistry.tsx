import type { ReactElement } from "react";

import type { PanelId } from "@rtc/client-core";

import { AnalyticsHead } from "#/ui/fx/analytics/AnalyticsHead";
import { FxBlotterHead } from "#/ui/fx/blotter/FxBlotterHead";
import { LiveRatesHead } from "#/ui/fx/liveRates/LiveRatesHead";
import { PositionsHead } from "#/ui/fx/positions/PositionsHead";

/** The real id→head-slot map, passed to InhouseLayoutEngine's headRegistry
 * prop. Panel ids without an entry fall back to the engine's default title
 * span (Task 4 restyled that span to match this same tab chrome, so
 * Credit/Equities/Admin/Credit Blotter — which have no entry here yet — read
 * as one family with the FX panels below). */
export const appHeadRegistry: Partial<Record<PanelId, () => ReactElement>> = {
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
