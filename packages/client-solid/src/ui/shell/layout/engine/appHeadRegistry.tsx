import type { JSX } from "solid-js";

import type { PanelId } from "@rtc/client-core";

import { CreditBlotterHead } from "#/ui/credit/blotter/CreditBlotterHead";
import { NewRfqHead } from "#/ui/credit/newRfq/NewRfqHead";
import { RfqsHead } from "#/ui/credit/rfqs/RfqsHead";
import { AnalyticsHead } from "#/ui/fx/analytics/AnalyticsHead";
import { FxBlotterHead } from "#/ui/fx/blotter/FxBlotterHead";
import { LiveRatesHead } from "#/ui/fx/liveRates/LiveRatesHead";
import { PositionsHead } from "#/ui/fx/positions/PositionsHead";

/** The real id→head-slot map, passed to InhouseLayoutEngine's headRegistry
 * prop. Panel ids without an entry fall back to the engine's default title
 * span (Sell Side has no entry here, matching the react registry — it reads
 * as one family with the FX panels via the engine's default title chrome).
 * FX + Credit so far (Tasks 13-14); Equities/Admin entries land with Tasks
 * 15-16. */
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
  "credit-new-rfq": () => {
    return <NewRfqHead />;
  },
  "credit-rfqs": () => {
    return <RfqsHead />;
  },
  "credit-blotter": () => {
    return <CreditBlotterHead />;
  },
};
