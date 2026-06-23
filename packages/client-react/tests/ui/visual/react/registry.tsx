import type { ReactElement } from "react";

import { App } from "#/ui/App";
import { AdminPanel } from "#/ui/admin/AdminPanel";
import { CreditBlotter } from "#/ui/credit/blotter/CreditBlotter";
import { CreditWorkspace } from "#/ui/credit/CreditWorkspace";
import { NewRfqForm } from "#/ui/credit/newRfq/NewRfqForm";
import { RfqCard } from "#/ui/credit/rfqTiles/RfqCard";
import { RfqTilesPanel } from "#/ui/credit/rfqTiles/RfqTilesPanel";
import { SellSidePanel } from "#/ui/credit/sellSide/SellSidePanel";
import { AnalyticsPanel } from "#/ui/fx/analytics/AnalyticsPanel";
import { BlotterRow } from "#/ui/fx/blotter/BlotterRow";
import { FxBlotter } from "#/ui/fx/blotter/FxBlotter";
import { LiveRatesPanel } from "#/ui/fx/liveRates/LiveRatesPanel";
import { Tile } from "#/ui/fx/liveRates/tile/Tile";
import { ConnectionOverlay } from "#/ui/shell/connection/ConnectionOverlay";
import { ConnectionStatusBar } from "#/ui/shell/connection/ConnectionStatusBar";

import { fixtures } from "../shared/fixtures";

// Maps a neutral componentKey to a concrete React element, given the scenario's
// fixture key so prop-bearing components can pull their props from the data.
// The SolidJS port supplies its own registry with the same keys.
export const registry: Record<string, (fixtureKey: string) => ReactElement> = {
  ConnectionStatusBar: () => {
    return <ConnectionStatusBar />;
  },
  Tile: (fixtureKey: string) => {
    const pair = fixtures[fixtureKey].currencyPairs[0];
    return <Tile pair={pair} showChart={false} />;
  },
  // Same Tile component with the sparkline shown (TileChart sub-component).
  TileChart: (fixtureKey: string) => {
    const pair = fixtures[fixtureKey].currencyPairs[0];
    return <Tile pair={pair} showChart={true} />;
  },
  AnalyticsPanel: () => {
    return <AnalyticsPanel />;
  },
  ConnectionOverlay: () => {
    return <ConnectionOverlay />;
  },
  LiveRatesPanel: () => {
    return <LiveRatesPanel />;
  },
  FxBlotter: () => {
    return <FxBlotter />;
  },
  // Prop-driven single highlighted (isNew) row, wrapped in a table so the <tr>
  // renders. The fake's useRowHighlight(isNew) returns isNew, so this snapshots
  // the blue-highlight branch deterministically (no timer / no waiting).
  BlotterRowHighlighted: (fixtureKey: string) => {
    const trade = fixtures[fixtureKey].trades[0];
    return (
      <table style={{ borderCollapse: "collapse" }}>
        <tbody>
          <BlotterRow trade={trade} isNew={true} />
        </tbody>
      </table>
    );
  },
  // The isolated baseline for the row above: same component, isNew=false, so it
  // snapshots the settled (transparent) branch. Pairing the two makes the
  // highlight the ONLY visual delta when diffing the isolated component.
  BlotterRowDefault: (fixtureKey: string) => {
    const trade = fixtures[fixtureKey].trades[0];
    return (
      <table style={{ borderCollapse: "collapse" }}>
        <tbody>
          <BlotterRow trade={trade} isNew={false} />
        </tbody>
      </table>
    );
  },
  RfqTilesPanel: () => {
    return <RfqTilesPanel />;
  },
  NewRfqForm: () => {
    return <NewRfqForm onCreated={() => {}} />;
  },
  CreditBlotter: () => {
    return <CreditBlotter />;
  },
  SellSidePanel: () => {
    return <SellSidePanel />;
  },
  // Prop-driven single RFQ card: pull the fixture's lone rfq + its quotes.
  RfqCard: (fixtureKey: string) => {
    const data = fixtures[fixtureKey];
    const rfq = data.rfqs[0];
    const quotes = data.quotesForRfq[rfq.id] ?? [];
    const instrument = data.instruments.find((i) => {
      return i.id === rfq.instrumentId;
    });
    return (
      <RfqCard
        rfq={rfq}
        quotes={quotes}
        instrument={instrument}
        dealers={data.dealers}
        onAccept={() => {}}
        onDismiss={() => {}}
      />
    );
  },
  CreditWorkspace: () => {
    return <CreditWorkspace />;
  },
  AdminPanel: () => {
    return <AdminPanel />;
  },
  App: () => {
    return <App />;
  },
};
