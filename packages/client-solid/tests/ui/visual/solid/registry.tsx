import { fixtures } from "@ui-visual-shared/fixtures";
import type { JSX } from "solid-js";

import type { LayoutState } from "@rtc/client-core";
import { createDefaultLayoutPort } from "@rtc/client-core";

import { App } from "#/ui/App";
import { AdminDashboard } from "#/ui/admin/AdminDashboard";
import { AdminHead } from "#/ui/admin/AdminHead";
import { AdminPanel } from "#/ui/admin/AdminPanel";
import { IncidentControls } from "#/ui/admin/IncidentControls";
import { KpiRow } from "#/ui/admin/kpis/KpiRow";
import { LiveEventLog } from "#/ui/admin/LiveEventLog";
import { ServiceTopologyGraph } from "#/ui/admin/ServiceTopologyGraph";
import { ServiceHealth } from "#/ui/admin/services/ServiceHealth";
import { CreditBlotter } from "#/ui/credit/blotter/CreditBlotter";
import { CreditBlotterHead } from "#/ui/credit/blotter/CreditBlotterHead";
import { NewRfqPanel } from "#/ui/credit/newRfq/NewRfqPanel";
import { RfqCard } from "#/ui/credit/rfqs/RfqCard";
import { RfqsPanel } from "#/ui/credit/rfqs/RfqsPanel";
import { rfqCardVm } from "#/ui/credit/rfqs/rfqCardVm";
import { SellSidePanel } from "#/ui/credit/sellSide/SellSidePanel";
import { EqBlotterPanel } from "#/ui/equities/blotter/EqBlotterPanel";
import { ChartPanel } from "#/ui/equities/chart/ChartPanel";
import { DepthLadder } from "#/ui/equities/chart/DepthLadder";
import { EqDepthDock } from "#/ui/equities/chart/EqDepthDock";
import { InstrumentHeader } from "#/ui/equities/chart/InstrumentHeader";
import { OrderTicket } from "#/ui/equities/ticket/OrderTicket";
import { SectorHeatmap } from "#/ui/equities/watchlist/SectorHeatmap";
import { WatchlistPanel } from "#/ui/equities/watchlist/WatchlistPanel";
import { AnalyticsPanel } from "#/ui/fx/analytics/AnalyticsPanel";
import { ActivityView } from "#/ui/fx/blotter/ActivityView";
import { BlotterRow } from "#/ui/fx/blotter/BlotterRow";
import { COLUMNS, formatFxCell } from "#/ui/fx/blotter/blotterColumns";
import { FxBlotter } from "#/ui/fx/blotter/FxBlotter";
import { LiveRatesPanel } from "#/ui/fx/liveRates/LiveRatesPanel";
import { Tile } from "#/ui/fx/liveRates/tile/Tile";
import { WatchlistView } from "#/ui/fx/liveRates/WatchlistView";
import { PositionsPanel } from "#/ui/fx/positions/PositionsPanel";
import { BootSequence } from "#/ui/shell/boot/BootSequence";
import { HeaderChrome } from "#/ui/shell/chrome/HeaderChrome";
import { ThemePicker } from "#/ui/shell/chrome/ThemePicker";
import { ConnectionOverlay } from "#/ui/shell/connection/ConnectionOverlay";
import { ConnectionStatusBar } from "#/ui/shell/connection/ConnectionStatusBar";
import { InhouseLayoutEngine } from "#/ui/shell/layout/engine/InhouseLayoutEngine";
import type { PanelRegistry } from "#/ui/shell/layout/engine/panelRegistry";
import { LockScreen } from "#/ui/shell/lock/LockScreen";
import { PreferencesModal } from "#/ui/shell/prefs/PreferencesModal";
import { StatusBar } from "#/ui/shell/status/StatusBar";

// The layout/fx-* scenarios test the ENGINE's geometry, not panel content, so
// each docked panel gets a stub body. Styled exactly like the app's own
// empty-panel placeholders (react registry parity): centred, muted, mono
// font, pinned line-height (the #width-flake determinism rule). Inline
// `style` is fine here — the src/ui inline-style ban is scoped to
// `packages/client-solid/src/**/*.tsx` only (see eslint.config.mjs), not this
// test harness. Solid's `style` prop takes kebab-case CSS property keys
// (unlike React's camelCase JSX.CSSProperties), and numeric lengths need an
// explicit unit string (Solid does not auto-append "px").
const stubPanelStyle: JSX.CSSProperties = {
  height: "100%",
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  "font-family": "var(--font-mono)",
  "font-size": "11px",
  "line-height": "15px",
  "letter-spacing": "0.08em",
  color: "var(--text-muted)",
};

function stubPanel(key: string, label: string): () => JSX.Element {
  return () => {
    return (
      <div data-testid={`${key}-body`} style={stubPanelStyle}>
        {label}
      </div>
    );
  };
}

const visualPanelRegistry: PanelRegistry = {
  "fx-rates": stubPanel("fx-rates", "LIVE RATES"),
  "fx-analytics": stubPanel("fx-analytics", "ANALYTICS"),
  "fx-positions": stubPanel("fx-positions", "POSITIONS"),
  "fx-blotter": stubPanel("fx-blotter", "BLOTTER"),
  "credit-rfqs": stubPanel("credit-rfqs", "RFQS"),
  "credit-blotter": stubPanel("credit-blotter", "CREDIT BLOTTER"),
  "admin-throughput": stubPanel("admin-throughput", "ADMIN"),
};

function noop(): void {}

// The layout engine's root (`.engine`) is `flex: 1` — it FILLS a sized flex
// parent, exactly as it does in the real app. Wrap it in a fixed box the size
// of the real workspace region — 1920 wide, 994 tall (the app's 1080 viewport
// minus header/status-bar) — so the arrangements render at faithful desktop
// proportions and the capture size is deterministic (the #width-flake rule).
function staticEngine(state: LayoutState): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        width: "1920px",
        height: "994px",
      }}
    >
      <InhouseLayoutEngine
        state={state}
        registry={visualPanelRegistry}
        onMaximize={noop}
        onRestore={noop}
        onCollapse={noop}
        onExpand={noop}
        onResize={noop}
      />
    </div>
  );
}

const fxState: LayoutState = createDefaultLayoutPort("fx").initial;

function panelWidth(px: number): JSX.CSSProperties {
  return { width: `${px}px`, display: "flex", "flex-direction": "column" };
}

// Maps a neutral componentKey to a concrete Solid element, given the
// scenario's fixture key so prop-bearing components can pull their props from
// the data. SAME componentKey set as the react registry — the framework-swap
// seam @ui-visual resolves to this file instead of react's.
export const registry: Record<string, (fixtureKey: string) => JSX.Element> = {
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
  PositionsPanel: () => {
    return <PositionsPanel />;
  },
  ConnectionOverlay: () => {
    return <ConnectionOverlay />;
  },
  LiveRatesPanel: () => {
    return <LiveRatesPanel />;
  },
  // The Watchlist table is width:100% (fills its panel like FxBlotter); pin a
  // fixed panel-width wrapper so the capture's content-width is deterministic
  // (avoids the same font-mono glyph-advance drift as fx-blotter/*).
  FxWatchlist: (fixtureKey: string) => {
    const pairs = fixtures[fixtureKey].currencyPairs;
    return (
      <div style={panelWidth(920)}>
        <WatchlistView pairs={pairs} filter="All" />
      </div>
    );
  },
  FxBlotter: () => {
    // Render filling a representative panel width (test-only), like the real
    // app where the blotter fills its layout panel — NOT shrink-to-content.
    return (
      <div style={panelWidth(920)}>
        <FxBlotter />
      </div>
    );
  },
  // Prop-driven Activity feed (FxBlotter's Activity tab body), rendered
  // directly like BlotterRow above — same width-920 panel wrapper as
  // FxBlotter/FxWatchlist. `activity` defaults to [] (fixtures that don't set
  // it), so the same registry entry covers both the empty and populated
  // scenarios by fixtureKey alone.
  FxActivityView: (fixtureKey: string) => {
    const entries = fixtures[fixtureKey].activity ?? [];
    return (
      <div style={panelWidth(920)}>
        <ActivityView entries={entries} />
      </div>
    );
  },
  // Prop-driven single highlighted (isNew) row, wrapped in a table so the <tr>
  // renders. The fake's useRowHighlight(isNew) returns isNew, so this snapshots
  // the blue-highlight branch deterministically (no timer / no waiting).
  BlotterRowHighlighted: (fixtureKey: string) => {
    const trade = fixtures[fixtureKey].trades[0];
    return (
      <table style={{ "border-collapse": "collapse" }}>
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
      <table style={{ "border-collapse": "collapse" }}>
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
  CreditBlotter: () => {
    // Render filling a representative panel width (test-only) — the credit
    // blotter table is width:100%, so a fixed-width wrapper pins the captured
    // dimension deterministically. Component stays responsive.
    return (
      <div style={panelWidth(920)}>
        <CreditBlotter />
      </div>
    );
  },
  // Head + body mounted together (sharing the harness's CreditViewProvider),
  // for scenarios that drive the head's quick-filter input against the
  // body's rows — same fixed-width rationale as CreditBlotter above.
  CreditBlotterWorkspace: () => {
    return (
      <div style={panelWidth(920)}>
        <CreditBlotterHead />
        <CreditBlotter />
      </div>
    );
  },
  // RfqsPanel: fixed width (test-only) — the panel's auto-fill CSS grid
  // (minmax 300px, 1fr) has a parent-driven column width; without a fixed
  // container the card text drives the total width, which varies on x86 CI
  // (font glyph-advance non-determinism), a dimension mismatch
  // maxDiffPixelRatio cannot absorb. In the real app the panel sits inside the
  // dock's fixed "RFQs" column. Component stays responsive.
  RfqsPanel: () => {
    return (
      <div style={panelWidth(400)}>
        <RfqsPanel />
      </div>
    );
  },
  // NewRfqPanel: fixed width (test-only), same rationale as RfqsPanel above —
  // the form's content-driven intrinsic size doesn't drift on x86. In the real
  // app it sits inside the dock's fixed "New RFQ" column, never shrink-to-fit.
  NewRfqPanel: () => {
    return (
      <div style={panelWidth(280)}>
        <NewRfqPanel onCreated={() => {}} />
      </div>
    );
  },
  // Prop-driven single RfqCard, bypassing RfqsPanel's filter/animation
  // bookkeeping — a static per-card-state shot (vm built directly via
  // rfqCardVm from the fixture's lone rfq + its quotes). Fixed width for the
  // same font-metric-drift reason as the other credit component keys above.
  RfqCardStandalone: (fixtureKey: string) => {
    const data = fixtures[fixtureKey];
    const rfq = data.rfqs[0];
    const quotes = data.quotesForRfq[rfq.id] ?? [];
    const vm = rfqCardVm(rfq, quotes, data.instruments, data.dealers);
    return (
      <div style={panelWidth(300)}>
        <RfqCard
          vm={vm}
          creationTimestamp={rfq.creationTimestamp}
          expirySecs={rfq.expirySecs}
          anim="none"
          delayMs={0}
          onAccept={() => {}}
          onCancel={() => {}}
          onRemove={() => {}}
          onAnimationEnd={() => {}}
        />
      </div>
    );
  },
  SellSidePanel: () => {
    // Render at a fixed width (test-only) — the sell-side panel is a flex
    // column with no parent width constraint; instrument-name and ticket text
    // widths vary by OS/arch font metrics, causing a dimension flake on x86
    // CI. Wrapping at 380px stabilises the captured dimension without
    // touching the component; in the real app it sits inside a fixed
    // credit-dock column. Component stays responsive.
    return (
      <div style={panelWidth(380)}>
        <SellSidePanel />
      </div>
    );
  },
  // Pinned wrapper: the loading arm is a single content-width text line, so
  // its captured WIDTH tracks x86 mono-glyph advances — a dimension flake
  // tolerance can never absorb. 660 matches the IncidentControls admin wrapper.
  AdminPanel: () => {
    return (
      <div style={panelWidth(660)}>
        <AdminPanel />
      </div>
    );
  },
  // --- Phase 5 Admin dashboard components ---
  // Full AdminDashboard at a fixed panel WIDTH (1280) but content-driven height,
  // so the full dashboard is captured without the bottom row being clipped. A
  // fixed width keeps the intrinsic capture DIMENSION deterministic (the
  // #width-flake rule); the inner charts carry their own explicit heights.
  AdminDashboard: () => {
    return (
      <div style={panelWidth(1280)}>
        <AdminDashboard />
      </div>
    );
  },
  // ServiceTopologyGraph at a fixed SVG-viewport size (300×200) so the SVG
  // viewBox fills the wrapper deterministically.
  ServiceTopologyGraph: () => {
    return (
      <div style={{ width: "300px", height: "200px" }}>
        <ServiceTopologyGraph />
      </div>
    );
  },
  // LiveEventLog at a fixed width — font-mono glyph-advance variance on x86
  // would flake a content-sized wrapper; pinning the width stabilises it.
  LiveEventLog: () => {
    return (
      <div style={panelWidth(400)}>
        <LiveEventLog />
      </div>
    );
  },
  // IncidentControls: renders the three inject buttons + Clear. The
  // admin/incident-active fixture seeds state so "Inject service down" button
  // has data-active="true" without any click interaction.
  // Render at a fixed width (test-only) — the controls are a content-width flex
  // row of buttons whose total width is driven by button label glyph-advance,
  // which varies by OS/arch font metrics. Pinning the wrapper at 660px (> max
  // observed content) captures a stable size.
  IncidentControls: () => {
    return (
      <div style={panelWidth(660)}>
        <IncidentControls />
      </div>
    );
  },
  // KpiRow: `.row` is a `grid-template-columns: repeat(4, 1fr)` strip — a
  // content-sized wrapper would flake on font-mono glyph-advance variance
  // (same rationale as IncidentControls/LiveEventLog above). 900px mirrors a
  // representative share of the dashboard's 1280px width.
  KpiRow: () => {
    return (
      <div style={panelWidth(900)}>
        <KpiRow />
      </div>
    );
  },
  // ServiceHealth: `.card` is `height: 100%` (fills its dashboard grid cell),
  // so an isolated shot needs an explicit parent height to resolve.
  ServiceHealth: () => {
    return (
      <div style={{ width: "360px", height: "280px" }}>
        <ServiceHealth />
      </div>
    );
  },
  // AdminHead: `.head` is `display: flex; flex: 1` (fills the panel header's
  // remaining width in the real layout engine) — a fixed-width flex wrapper
  // stabilises the title/pill spacing for an isolated shot.
  AdminHead: () => {
    return (
      <div style={{ width: "480px", display: "flex" }}>
        <AdminHead />
      </div>
    );
  },
  App: () => {
    return <App />;
  },
  // --- Phase 4: Equities sub-components (fixed-size wrappers for x86 stability) ---
  // SectorHeatmap and DepthLadder survive outside the four-panel dock: eq-
  // sectors/eq-depth are registered but not placed in the default tree, so
  // these scenarios mount them directly with fixed props, same as before.
  EquitiesSectorHeatmap: () => {
    return (
      <div style={{ width: "280px" }}>
        <SectorHeatmap selectedSymbol="AAPL" onSelect={() => {}} />
      </div>
    );
  },
  EquitiesDepthLadder: () => {
    return (
      <div style={{ width: "260px" }}>
        <DepthLadder symbol="AAPL" />
      </div>
    );
  },
  // The dock wrapper's OWN pixels are its unselected placeholder — the
  // selected arm delegates to DepthLadder (equities/depth-ladder above).
  EquitiesDepthDock: () => {
    return (
      <div style={{ width: "260px" }}>
        <EqDepthDock />
      </div>
    );
  },
  // Sized stage so the absolutely-positioned skin listbox falls inside the
  // captured scenario-root box once the click action opens it.
  ChromeThemePicker: () => {
    return (
      <div
        style={{
          width: "340px",
          height: "320px",
          display: "flex",
          "justify-content": "flex-end",
          "align-items": "flex-start",
        }}
      >
        <ThemePicker />
      </div>
    );
  },
  EquitiesOrderTicket: () => {
    return (
      <div style={{ width: "280px" }}>
        <OrderTicket symbol="AAPL" />
      </div>
    );
  },
  // --- Task 7: four-panel dock components (fixed-size wrappers, same
  // rationale as the Phase 4 sub-components above: these panels are
  // width/height:100% inside the dock, so a bare mount has no definite box to
  // fill — pin an explicit content box for a deterministic capture). All read
  // the shared eqWorkspace/quote/candle hooks through useViewModel, so the
  // fixture must set `equityWorkspace` (equitiesBase does) for a populated,
  // non-"SELECT AN INSTRUMENT" render.
  EquitiesChartPanel: () => {
    return (
      <div style={{ width: "760px", height: "460px", display: "flex" }}>
        <ChartPanel />
      </div>
    );
  },
  // InstrumentHeader is a pure props leaf (not hook-driven, unlike the panel
  // above) — mounted directly with literal AAPL data matching equitiesBase, a
  // forced flashOn=true/dir="up" to pin the tick-flash accent arm that a
  // static ChartPanel capture (no live ticks) can never reach on its own.
  // 820 (not 640): at 640 the stats block sat exactly at the flex-wrap
  // threshold, so x86 glyph-advance drift flipped the capture between one-row
  // and two-row layouts. 820 is decisively one-row, matching the wide chart
  // panel the header always fills in the real app.
  EquitiesInstrumentHeader: () => {
    return (
      <div style={{ width: "820px" }}>
        <InstrumentHeader
          symbol="AAPL"
          instrumentName="Apple Inc."
          exchange="NASDAQ"
          quote={{
            symbol: "AAPL",
            bid: 178.4,
            ask: 178.6,
            last: 178.5,
            changePct: 3.45,
            timestamp: 1_750_000_000_000,
          }}
          candles={[]}
          flashOn={true}
          flashDir="up"
        />
      </div>
    );
  },
  EquitiesWatchlistPanel: () => {
    return (
      <div style={{ width: "280px", height: "420px", display: "flex" }}>
        <WatchlistPanel />
      </div>
    );
  },
  EquitiesBlotterPanel: () => {
    return (
      <div style={{ width: "720px", height: "360px", display: "flex" }}>
        <EqBlotterPanel />
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
    // on WIDTH. Pinning the width makes the snapshot dimensions deterministic;
    // residual sub-pixel text jitter is absorbed by the tier's maxDiffPixelRatio.
    // flex-column so the child stretches to this width.
    return (
      <div
        style={{ display: "flex", "flex-direction": "column", width: "880px" }}
      >
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
          inset: "0",
          "background-color": "var(--bg-primary)",
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
  // fx-analytics carries maximizeScope: "nearest-column" in PANEL_SPECS, so
  // this captures the rail-scoped state: positions strips inside the rail;
  // rates/blotter and the rail's 360px width are untouched.
  LayoutEngineRailMaximized: () => {
    return staticEngine({ ...fxState, maximized: "fx-analytics" });
  },
};
