import type { ReactElement } from "react";

import type { PanelId } from "@rtc/client-core";

import { LiveRatesHead } from "#/ui/fx/liveRates/LiveRatesHead";

/** The real id→head-slot map, passed to InhouseLayoutEngine's headRegistry
 * prop. Panel ids without an entry fall back to the engine's default title
 * span. Task 12 adds fx-blotter's Trades/Activity head. */
export const appHeadRegistry: Partial<Record<PanelId, () => ReactElement>> = {
  "fx-rates": () => {
    return <LiveRatesHead />;
  },
};
