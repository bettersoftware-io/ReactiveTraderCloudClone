import type { ReactElement } from "react";

import { createDefaultLayoutPort } from "#/app/layout/defaultLayoutPort";
import type { LayoutState } from "#/app/layout/layoutPort";
import { App } from "#/ui/App";
import { AdminDashboard } from "#/ui/admin/AdminDashboard";
import { AdminPanel } from "#/ui/admin/AdminPanel";
import { IncidentControls } from "#/ui/admin/IncidentControls";
import { LiveEventLog } from "#/ui/admin/LiveEventLog";
import { ServiceTopologyGraph } from "#/ui/admin/ServiceTopologyGraph";
import { CreditBlotter } from "#/ui/credit/blotter/CreditBlotter";
import { CreditWorkspace } from "#/ui/credit/CreditWorkspace";
import { NewRfqForm } from "#/ui/credit/newRfq/NewRfqForm";
import { RfqCard } from "#/ui/credit/rfqTiles/RfqCard";
import { RfqTilesPanel } from "#/ui/credit/rfqTiles/RfqTilesPanel";
import { SellSidePanel } from "#/ui/credit/sellSide/SellSidePanel";
import { PositionsBlotter } from "#/ui/equities/blotter/PositionsBlotter";
import { DepthLadder } from "#/ui/equities/chart/DepthLadder";
import { PriceChart } from "#/ui/equities/chart/PriceChart";
import { EquitiesPanel } from "#/ui/equities/EquitiesPanel";
import { OrderTicket } from "#/ui/equities/ticket/OrderTicket";
import { SectorHeatmap } from "#/ui/equities/watchlist/SectorHeatmap";
import { Watchlist } from "#/ui/equities/watchlist/Watchlist";
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
    // Render filling a representative panel width (test-only), like the real
    // app where the blotter fills its layout panel — NOT shrink-to-content.
    // The blotter table is width:100%, so a fixed-width wrapper pins the
    // captured dimension deterministically; without it the intrinsic
    // content-width resolved non-deterministically on x86 (~46-66px drift),
    // a size mismatch maxDiffPixelRatio cannot absorb. The FxBlotter component
    // itself is untouched and stays fully responsive.
    return (
      <div style={{ width: 920, display: "flex", flexDirection: "column" }}>
        <FxBlotter />
      </div>
    );
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
    // Render at a fixed width (test-only) — the panel's auto-fill CSS grid
    // (minmax 320px, 1fr) has a parent-driven column width; without a fixed
    // container the RfqFilterTabs text drives the total width, which varies
    // ±4-8px on x86 CI (font glyph-advance non-determinism), a dimension
    // mismatch maxDiffPixelRatio cannot absorb. In the real app the panel sits
    // inside a fixed CreditWorkspace column. Component stays responsive.
    return (
      <div style={{ width: 400, display: "flex", flexDirection: "column" }}>
        <RfqTilesPanel />
      </div>
    );
  },
  NewRfqForm: () => {
    // Render at a fixed width (test-only) so the form's content-driven
    // intrinsic size doesn't drift on x86 (font-metric non-determinism).
    // The form's max-width:400px allows it to fill 280px comfortably; in the
    // real app it sits inside a fixed-size panel column, never shrink-to-fit.
    return (
      <div style={{ width: 280, display: "flex", flexDirection: "column" }}>
        <NewRfqForm onCreated={() => {}} />
      </div>
    );
  },
  CreditBlotter: () => {
    // Render filling a representative panel width (test-only) — the credit
    // blotter table is width:100%, so a fixed-width wrapper pins the captured
    // dimension deterministically; without it the intrinsic content-width
    // resolves non-deterministically on x86 (~80-150px drift), a size
    // mismatch maxDiffPixelRatio cannot absorb. Component stays responsive.
    return (
      <div style={{ width: 920, display: "flex", flexDirection: "column" }}>
        <CreditBlotter />
      </div>
    );
  },
  SellSidePanel: () => {
    // Render at a fixed width (test-only) — the sell-side panel is a flex
    // column with no parent width constraint; instrument-name and ticket text
    // widths vary by OS/arch font metrics, causing a ±24px dimension flake on
    // x86 CI (observed: 352↔328px run-to-run). Wrapping at 380px stabilises
    // the captured dimension without touching the component; in the real app it
    // sits inside a fixed CreditWorkspace column. Component stays responsive.
    return (
      <div style={{ width: 380, display: "flex", flexDirection: "column" }}>
        <SellSidePanel />
      </div>
    );
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
  // --- Phase 5 Admin dashboard components ---
  // Full AdminDashboard at fixed 1280×700: mirrors the panel-sized container the
  // real app provides. Fixed height prevents content overflow from unresolved
  // canvas dimensions in headless mode.
  AdminDashboard: () => {
    return (
      <div
        style={{
          width: 1280,
          height: 700,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <AdminDashboard />
      </div>
    );
  },
  // ServiceTopologyGraph at a fixed SVG-viewport size (300×200) so the SVG
  // viewBox fills the wrapper deterministically.
  ServiceTopologyGraph: () => {
    return (
      <div style={{ width: 300, height: 200 }}>
        <ServiceTopologyGraph />
      </div>
    );
  },
  // LiveEventLog at a fixed width — font-mono glyph-advance variance on x86
  // would flake a content-sized wrapper; pinning the width stabilises it.
  LiveEventLog: () => {
    return (
      <div style={{ width: 400, display: "flex", flexDirection: "column" }}>
        <LiveEventLog />
      </div>
    );
  },
  // IncidentControls: renders the three inject buttons + Clear. The
  // admin/incident-active fixture seeds state so "Inject service down" button
  // has data-active="true" without any click interaction.
  // Render at a fixed width (test-only) — the controls are a content-width flex
  // row of buttons whose total width is driven by button label glyph-advance,
  // which varies by OS/arch font metrics (±68px dimension flake on x86 — 613↔545).
  // Pinning the wrapper at 660px (> max observed content) captures a stable size.
  IncidentControls: () => {
    return (
      <div style={{ width: 660, display: "flex", flexDirection: "column" }}>
        <IncidentControls />
      </div>
    );
  },
  App: () => {
    return <App />;
  },
  // --- Phase 4: Equities sub-components (fixed-size wrappers for x86 stability) ---
  // Watchlist at fixed width — content-sized goldens flake on x86 due to
  // font-mono glyph-advance variance; pinning the width makes the snapshot stable.
  EquitiesWatchlist: () => {
    return (
      <div style={{ width: 280, display: "flex", flexDirection: "column" }}>
        <Watchlist selectedSymbol="AAPL" onSelect={() => {}} />
      </div>
    );
  },
  EquitiesSectorHeatmap: () => {
    return (
      <div style={{ width: 280 }}>
        <SectorHeatmap selectedSymbol="AAPL" onSelect={() => {}} />
      </div>
    );
  },
  // PriceChart: fixed-size container so canvas.offsetWidth/Height resolve to real
  // dimensions in the headless browser (the canvas is display:block width/height 100%).
  EquitiesPriceChart: () => {
    return (
      <div style={{ width: 400, height: 200 }}>
        <PriceChart symbol="AAPL" />
      </div>
    );
  },
  EquitiesDepthLadder: () => {
    return (
      <div style={{ width: 260 }}>
        <DepthLadder symbol="AAPL" />
      </div>
    );
  },
  EquitiesOrderTicket: () => {
    return (
      <div style={{ width: 280 }}>
        <OrderTicket symbol="AAPL" />
      </div>
    );
  },
  // PositionsBlotter includes the DeskPnlGauge SVG arc + PnlSparkline bars.
  // Fixed width prevents content-size variance from font-mono metrics.
  EquitiesPositionsBlotter: () => {
    return (
      <div style={{ width: 520 }}>
        <PositionsBlotter />
      </div>
    );
  },
  // EquitiesPanel at fixed 1280×680: mirrors the InhouseLayoutEngine constraint
  // the panel receives in the real app. The panel's height:100% needs a parent
  // with a resolved height (unlike a content-sized inline-block wrapper).
  EquitiesPanel: () => {
    return (
      <div
        style={{
          width: 1280,
          height: 680,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <EquitiesPanel />
      </div>
    );
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
