import type { ReactElement } from "react";

import { createDefaultLayoutPort } from "#/app/layout/defaultLayoutPort";
import type { LayoutState } from "#/app/layout/layoutPort";
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
import { COLUMNS, formatFxCell } from "#/ui/fx/blotter/blotterColumns";
import { FxBlotter } from "#/ui/fx/blotter/FxBlotter";
import { LiveRatesPanel } from "#/ui/fx/liveRates/LiveRatesPanel";
import { Tile } from "#/ui/fx/liveRates/tile/Tile";
import { BootSequence } from "#/ui/shell/boot/BootSequence";
import { HeaderChrome } from "#/ui/shell/chrome/HeaderChrome";
import { ConnectionOverlay } from "#/ui/shell/connection/ConnectionOverlay";
import { ConnectionStatusBar } from "#/ui/shell/connection/ConnectionStatusBar";
import { InhouseLayoutEngine } from "#/ui/shell/layout/engine/InhouseLayoutEngine";
import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import { LockScreen } from "#/ui/shell/lock/LockScreen";
import { PreferencesModal } from "#/ui/shell/prefs/PreferencesModal";
import { StatusBar } from "#/ui/shell/status/StatusBar";

import { fixtures } from "../shared/fixtures";

const fxState: LayoutState = createDefaultLayoutPort("fx").initial;

const visualPanelRegistry: PanelRegistry = {
  "fx-rates": () => {
    return <div data-testid="fx-rates-body">RATES</div>;
  },
  "fx-analytics": () => {
    return <div data-testid="fx-analytics-body">ANALYTICS</div>;
  },
  "fx-blotter": () => {
    return <div data-testid="fx-blotter-body">BLOTTER</div>;
  },
  "credit-rfqs": () => {
    return <div data-testid="credit-rfqs-body">RFQS</div>;
  },
  "credit-blotter": () => {
    return <div data-testid="credit-blotter-body">CREDIT BLOTTER</div>;
  },
  "admin-throughput": () => {
    return <div data-testid="admin-throughput-body">ADMIN</div>;
  },
};

function noop(): void {}

function staticEngine(state: LayoutState): ReactElement {
  return (
    <InhouseLayoutEngine
      state={state}
      registry={visualPanelRegistry}
      onMaximize={noop}
      onRestore={noop}
      onCollapse={noop}
      onExpand={noop}
      onResize={noop}
    />
  );
}

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
          <BlotterRow
            trade={trade}
            isNew={true}
            columns={COLUMNS}
            format={formatFxCell}
          />
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
          <BlotterRow
            trade={trade}
            isNew={false}
            columns={COLUMNS}
            format={formatFxCell}
          />
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
  // --- Phase 2 HUD shell surfaces ---
  BootSequence: () => {
    return <BootSequence onDone={() => {}} />;
  },
  LockScreen: () => {
    return <LockScreen />;
  },
  HeaderChrome: () => {
    return <HeaderChrome activeTab="fx" onTabChange={() => {}} />;
  },
  StatusBar: () => {
    // Render at a FIXED width (like the real app, where StatusBar stretches to
    // the full-width column flex of `.app`) instead of letting the inline-block
    // scenario-root shrink it to content. StatusBar text uses var(--font-mono);
    // its content width resolves non-deterministically under x86 headless
    // (glyph-advance metrics vary run-to-run), so a content-sized golden flakes
    // on WIDTH (871<->811). Pinning the width makes the snapshot dimensions
    // deterministic; residual sub-pixel text jitter is absorbed by the tier's
    // maxDiffPixelRatio. flex-column so the child stretches to this width.
    return (
      <div style={{ display: "flex", flexDirection: "column", width: 880 }}>
        <StatusBar />
      </div>
    );
  },
  PreferencesModal: () => {
    // The modal's backdrop is translucent; paint a deterministic dark field
    // behind it so the capture isn't over the host's default body colour.
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "var(--bg-primary)",
        }}
      >
        <PreferencesModal open={true} onClose={() => {}} />
      </div>
    );
  },
  LayoutEngineDefault: () => {
    return staticEngine(fxState);
  },
  LayoutEngineMaximized: () => {
    return staticEngine({ ...fxState, maximized: "fx-rates" });
  },
  LayoutEngineCollapsed: () => {
    return staticEngine({ ...fxState, collapsed: ["fx-analytics"] });
  },
};
