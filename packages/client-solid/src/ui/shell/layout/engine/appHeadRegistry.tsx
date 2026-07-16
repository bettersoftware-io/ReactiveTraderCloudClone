import type { JSX } from "solid-js";

import type { PanelId } from "@rtc/client-core";

import { AdminHead } from "#/ui/admin/AdminHead";
import { CreditBlotterHead } from "#/ui/credit/blotter/CreditBlotterHead";
import { NewRfqHead } from "#/ui/credit/newRfq/NewRfqHead";
import { RfqsHead } from "#/ui/credit/rfqs/RfqsHead";
import { EqBlotterHead } from "#/ui/equities/blotter/EqBlotterHead";
import { EqChartHead } from "#/ui/equities/chart/EqChartHead";
import { EqTicketHead } from "#/ui/equities/ticket/EqTicketHead";
import { EqWatchlistHead } from "#/ui/equities/watchlist/EqWatchlistHead";
import { AnalyticsHead } from "#/ui/fx/analytics/AnalyticsHead";
import { FxBlotterHead } from "#/ui/fx/blotter/FxBlotterHead";
import { LiveRatesHead } from "#/ui/fx/liveRates/LiveRatesHead";
import { PositionsHead } from "#/ui/fx/positions/PositionsHead";

/** The real id→head-slot map, passed to InhouseLayoutEngine's headRegistry
 * prop. Panel ids without an entry fall back to the engine's default title
 * span (Sell Side has no entry here, matching the react registry — it reads
 * as one family with the FX panels via the engine's default title chrome).
 * All four domains present (Tasks 13-16) — mirrors the react
 * `appHeadRegistry.tsx`'s full entry set. */
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
  "eq-chart": () => {
    return <EqChartHead />;
  },
  "eq-blotter": () => {
    return <EqBlotterHead />;
  },
  "eq-ticket": () => {
    return <EqTicketHead />;
  },
  "eq-watchlist": () => {
    return <EqWatchlistHead />;
  },
  "admin-dashboard": () => {
    return <AdminHead />;
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
