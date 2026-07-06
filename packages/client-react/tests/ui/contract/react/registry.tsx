import type { ReactElement } from "react";

import type {
  NotionalIntents,
  NotionalView,
  PanelId,
  TileExecutionState,
} from "@rtc/client-core";
import type {
  CurrencyCategory,
  CurrencyPair,
  CurrencyPairPosition,
  Dealer,
  Direction,
  EquityPosition,
  HistoricPosition,
  Instrument,
  Price,
  PriceMovementType,
  Quote,
  Rfq,
  Trade,
} from "@rtc/domain";

import { AdminDashboard as AdminDashboardComponent } from "#/ui/admin/AdminDashboard";
import { AdminPanel as AdminPanelComponent } from "#/ui/admin/AdminPanel";
import { IncidentControls as IncidentControlsComponent } from "#/ui/admin/IncidentControls";
import { KpiRow as KpiRowComponent } from "#/ui/admin/kpis/KpiRow";
import { LatencyHistogram as LatencyHistogramComponent } from "#/ui/admin/LatencyHistogram";
import { LiveEventLog as LiveEventLogComponent } from "#/ui/admin/LiveEventLog";
import { ServiceTopologyGraph as ServiceTopologyGraphComponent } from "#/ui/admin/ServiceTopologyGraph";
import { SessionsPanel as SessionsPanelComponent } from "#/ui/admin/SessionsPanel";
import { ThroughputChart as ThroughputChartComponent } from "#/ui/admin/ThroughputChart";
import { CreditBlotter as CreditBlotterComponent } from "#/ui/credit/blotter/CreditBlotter";
import { NewRfqForm as NewRfqFormComponent } from "#/ui/credit/newRfq/NewRfqForm";
import { QuoteCard as QuoteCardComponent } from "#/ui/credit/rfqTiles/QuoteCard";
import { RfqCard as RfqCardComponent } from "#/ui/credit/rfqTiles/RfqCard";
import {
  type RfqFilter,
  RfqFilterTabs as RfqFilterTabsComponent,
} from "#/ui/credit/rfqTiles/RfqFilterTabs";
import { RfqTilesPanel as RfqTilesPanelComponent } from "#/ui/credit/rfqTiles/RfqTilesPanel";
import { SellSidePanel as SellSidePanelComponent } from "#/ui/credit/sellSide/SellSidePanel";
import { TradeTicket as TradeTicketComponent } from "#/ui/credit/sellSide/TradeTicket";
import { DeskPnlGauge as DeskPnlGaugeComponent } from "#/ui/equities/blotter/DeskPnlGauge";
import { OrdersBlotter as OrdersBlotterComponent } from "#/ui/equities/blotter/OrdersBlotter";
import { PnlSparkline as PnlSparklineComponent } from "#/ui/equities/blotter/PnlSparkline";
import { PositionsBlotter as PositionsBlotterComponent } from "#/ui/equities/blotter/PositionsBlotter";
import { DepthLadder as DepthLadderComponent } from "#/ui/equities/chart/DepthLadder";
import { PriceChart as PriceChartComponent } from "#/ui/equities/chart/PriceChart";
import { EquitiesPanel as EquitiesPanelComponent } from "#/ui/equities/EquitiesPanel";
import { InstrumentTabs as InstrumentTabsComponent } from "#/ui/equities/tabs/InstrumentTabs";
import { OrderTicket as OrderTicketComponent } from "#/ui/equities/ticket/OrderTicket";
import { SectorHeatmap as SectorHeatmapComponent } from "#/ui/equities/watchlist/SectorHeatmap";
import { Watchlist as WatchlistComponent } from "#/ui/equities/watchlist/Watchlist";
import { AnalyticsHead as AnalyticsHeadComponent } from "#/ui/fx/analytics/AnalyticsHead";
import { AnalyticsPanel as AnalyticsPanelComponent } from "#/ui/fx/analytics/AnalyticsPanel";
import { PairPnlBars as PairPnlBarsComponent } from "#/ui/fx/analytics/PairPnlBars";
import { PnlChart as PnlChartComponent } from "#/ui/fx/analytics/PnlChart";
import { PnlValue as PnlValueComponent } from "#/ui/fx/analytics/PnlValue";
import { BlotterHeader as BlotterHeaderComponent } from "#/ui/fx/blotter/BlotterHeader";
import { BlotterRow as BlotterRowComponent } from "#/ui/fx/blotter/BlotterRow";
import { COLUMNS, formatFxCell } from "#/ui/fx/blotter/blotterColumns";
import { DateFilter as DateFilterComponent } from "#/ui/fx/blotter/columnFilter/DateFilter";
import type { ColumnFilter } from "#/ui/fx/blotter/columnFilter/filterState";
import { NumberFilter as NumberFilterComponent } from "#/ui/fx/blotter/columnFilter/NumberFilter";
import { SetFilter as SetFilterComponent } from "#/ui/fx/blotter/columnFilter/SetFilter";
import type { SortState } from "#/ui/fx/blotter/columnSort";
import { FxBlotter as FxBlotterComponent } from "#/ui/fx/blotter/FxBlotter";
import { FxBlotterHead as FxBlotterHeadComponent } from "#/ui/fx/blotter/FxBlotterHead";
import { QuickFilter as QuickFilterComponent } from "#/ui/fx/blotter/QuickFilter";
import { CurrencyFilter as CurrencyFilterComponent } from "#/ui/fx/liveRates/CurrencyFilter";
import { LiveRatesHead as LiveRatesHeadComponent } from "#/ui/fx/liveRates/LiveRatesHead";
import { LiveRatesPanel as LiveRatesPanelComponent } from "#/ui/fx/liveRates/LiveRatesPanel";
import { RfqCountdown as RfqCountdownComponent } from "#/ui/fx/liveRates/tile/RfqCountdown";
import { SpreadDisplay as SpreadDisplayComponent } from "#/ui/fx/liveRates/tile/SpreadDisplay";
import { Tile as TileComponent } from "#/ui/fx/liveRates/tile/Tile";
import { TileConfirmation as TileConfirmationComponent } from "#/ui/fx/liveRates/tile/TileConfirmation";
import { TileFooter as TileFooterComponent } from "#/ui/fx/liveRates/tile/TileFooter";
import { TileHeader as TileHeaderComponent } from "#/ui/fx/liveRates/tile/TileHeader";
import { TileNotional as TileNotionalComponent } from "#/ui/fx/liveRates/tile/TileNotional";
import { TilePrice as TilePriceComponent } from "#/ui/fx/liveRates/tile/TilePrice";
import {
  TileRfq as TileRfqComponent,
  type TileRfqState,
} from "#/ui/fx/liveRates/tile/TileRfq";
import { PositionsHead as PositionsHeadComponent } from "#/ui/fx/positions/PositionsHead";
import { PositionsPanel as PositionsPanelComponent } from "#/ui/fx/positions/PositionsPanel";
import { AmbientBackground as AmbientBackgroundComponent } from "#/ui/shell/background/AmbientBackground";
import { BootGate as BootGateComponent } from "#/ui/shell/boot/BootGate";
import { BootSequence as BootSequenceComponent } from "#/ui/shell/boot/BootSequence";
import {
  HeaderChrome as HeaderChromeComponent,
  type WorkspaceTab,
} from "#/ui/shell/chrome/HeaderChrome";
import { ThemePicker as ThemePickerComponent } from "#/ui/shell/chrome/ThemePicker";
import { ConnectionOverlay as ConnectionOverlayComponent } from "#/ui/shell/connection/ConnectionOverlay";
import { ConnectionStatusBar as ConnectionStatusBarComponent } from "#/ui/shell/connection/ConnectionStatusBar";
import { LockScreen as LockScreenComponent } from "#/ui/shell/lock/LockScreen";
import { PreferencesModal as PreferencesModalComponent } from "#/ui/shell/prefs/PreferencesModal";
import { StaleIndicator as StaleIndicatorComponent } from "#/ui/shell/stale/StaleIndicator";
import { StatusBar as StatusBarComponent } from "#/ui/shell/status/StatusBar";
import { ThemeToggle as ThemeToggleComponent } from "#/ui/shell/theme/ThemeToggle";

import {
  AdminDashboard,
  AdminPanel,
  AmbientBackground,
  AnalyticsHead,
  AnalyticsPanel,
  AnimationProbe,
  BlotterHeader,
  BlotterRow,
  BootGate,
  BootSequence,
  ConnectionOverlay,
  ConnectionStatusBar,
  CreditBlotter,
  CurrencyFilter,
  DateFilter,
  DepthLadder,
  DeskPnlGauge,
  EquitiesPanel,
  FxBlotter,
  FxBlotterWorkspace,
  HeaderChrome,
  IncidentControls,
  InstrumentTabs,
  KpiRow,
  LatencyHistogram,
  LayoutEngine,
  LiveEventLog,
  LiveRatesPanel,
  LiveRatesWorkspace,
  LockScreen,
  NewRfqForm,
  NumberFilter,
  OrdersBlotter,
  OrderTicket,
  PairPnlBars,
  PnlChart,
  PnlSparkline,
  PnlValue,
  PositionsBlotter,
  PositionsHead,
  PositionsPanel,
  PreferencesModal,
  PriceChart,
  QuickFilter,
  QuoteCard,
  RfqCard,
  RfqCountdown,
  RfqFilterTabs,
  RfqTilesPanel,
  SectorHeatmap,
  SellSidePanel,
  ServiceTopologyGraph,
  SessionsPanel,
  SetFilter,
  SpreadDisplay,
  StaleIndicator,
  StatusBar,
  ThemePicker,
  ThemeToggle,
  ThroughputChart,
  Tile,
  TileConfirmation,
  TileFooter,
  TileHeader,
  TileNotional,
  TilePrice,
  TileRfq,
  TradeTicket,
  Watchlist,
} from "../shared/components";
import type {
  ComponentToken,
  MountedComponent,
} from "../shared/harness/component";
import { AnimationProbe as AnimationProbeComponent } from "./AnimationProbe";
import { LayoutEngineHost } from "./LayoutEngineHost";

function noopFilter(_f: ColumnFilter | null): void {}

type AnyToken = ComponentToken<unknown, MountedComponent<unknown>>;
type ElementFor = (props: Record<string, unknown>) => ReactElement;

/** token → React element factory. Identity-keyed; no string keys. */
export const registry = new Map<AnyToken, ElementFor>([
  [
    AnimationProbe,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <AnimationProbeComponent
          target={(p.target as string) ?? "tile:EURUSD"}
        />
      );
    },
  ],
  [
    BootSequence,
    (): ReactElement => {
      return <BootSequenceComponent onDone={(): void => {}} />;
    },
  ],
  [
    BootGate,
    (): ReactElement => {
      return (
        <BootGateComponent>
          <div data-testid="boot-gate-child" />
        </BootGateComponent>
      );
    },
  ],
  [
    AnalyticsPanel,
    (): ReactElement => {
      return <AnalyticsPanelComponent />;
    },
  ],
  [
    AnalyticsHead,
    (): ReactElement => {
      return <AnalyticsHeadComponent />;
    },
  ],
  [
    PnlValue,
    (p: Record<string, unknown>): ReactElement => {
      return <PnlValueComponent value={p.value as number} />;
    },
  ],
  [
    PairPnlBars,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <PairPnlBarsComponent
          positions={(p.positions as readonly CurrencyPairPosition[]) ?? []}
        />
      );
    },
  ],
  [
    PnlChart,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <PnlChartComponent
          history={(p.history as readonly HistoricPosition[]) ?? []}
        />
      );
    },
  ],
  [
    PositionsPanel,
    (): ReactElement => {
      return <PositionsPanelComponent />;
    },
  ],
  [
    PositionsHead,
    (): ReactElement => {
      return <PositionsHeadComponent />;
    },
  ],
  [
    ConnectionStatusBar,
    (): ReactElement => {
      return <ConnectionStatusBarComponent />;
    },
  ],
  [
    FxBlotter,
    (): ReactElement => {
      return <FxBlotterComponent />;
    },
  ],
  [
    FxBlotterWorkspace,
    (): ReactElement => {
      return (
        <>
          <FxBlotterHeadComponent />
          <FxBlotterComponent />
        </>
      );
    },
  ],
  [
    QuickFilter,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <QuickFilterComponent
          value={(p.value as string) ?? ""}
          onChange={(p.onChange as (v: string) => void) ?? ((): void => {})}
        />
      );
    },
  ],
  [
    BlotterRow,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <table>
          <tbody>
            <BlotterRowComponent
              trade={p.trade as Trade}
              isNew={(p.isNew as boolean) ?? false}
              columns={COLUMNS}
              format={formatFxCell}
            />
          </tbody>
        </table>
      );
    },
  ],
  [
    BlotterHeader,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <table>
          <thead>
            <BlotterHeaderComponent
              sort={(p.sort as SortState) ?? { column: null, direction: null }}
              onSort={
                (p.onSort as (c: keyof Trade) => void) ?? ((): void => {})
              }
              filters={
                (p.filters as Map<keyof Trade, ColumnFilter>) ?? new Map()
              }
              onFilter={
                (p.onFilter as (
                  c: keyof Trade,
                  f: ColumnFilter | null,
                ) => void) ?? ((): void => {})
              }
              rows={
                (p.rows as readonly Trade[]) ??
                (p.trades as readonly Trade[]) ??
                []
              }
              columns={COLUMNS}
            />
          </thead>
        </table>
      );
    },
  ],
  [
    SetFilter,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <SetFilterComponent<Trade>
          column={(p.column as keyof Trade) ?? "currencyPair"}
          rows={
            (p.rows as readonly Trade[]) ?? (p.trades as readonly Trade[]) ?? []
          }
          currentFilter={p.currentFilter as ColumnFilter<Trade> | undefined}
          onApply={
            (p.onApply as (f: ColumnFilter<Trade> | null) => void) ?? noopFilter
          }
        />
      );
    },
  ],
  [
    NumberFilter,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <NumberFilterComponent<Trade>
          column={(p.column as keyof Trade) ?? "notional"}
          currentFilter={p.currentFilter as ColumnFilter<Trade> | undefined}
          onApply={
            (p.onApply as (f: ColumnFilter<Trade> | null) => void) ?? noopFilter
          }
        />
      );
    },
  ],
  [
    DateFilter,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <DateFilterComponent<Trade>
          column={(p.column as keyof Trade) ?? "tradeDate"}
          currentFilter={p.currentFilter as ColumnFilter<Trade> | undefined}
          onApply={
            (p.onApply as (f: ColumnFilter<Trade> | null) => void) ?? noopFilter
          }
        />
      );
    },
  ],
  [
    NewRfqForm,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <NewRfqFormComponent
          onCreated={(p.onCreated as (id: number) => void) ?? ((): void => {})}
        />
      );
    },
  ],
  [
    RfqFilterTabs,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <RfqFilterTabsComponent
          selected={(p.selected as RfqFilter) ?? "Live"}
          onChange={(p.onChange as (f: RfqFilter) => void) ?? ((): void => {})}
        />
      );
    },
  ],
  [
    QuoteCard,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <QuoteCardComponent
          quote={p.quote as Quote}
          dealer={p.dealer as Dealer | undefined}
          onAccept={p.onAccept as ((id: number) => void) | undefined}
        />
      );
    },
  ],
  [
    RfqCard,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <RfqCardComponent
          rfq={p.rfq as Rfq}
          quotes={(p.quotes as readonly Quote[]) ?? []}
          instrument={p.instrument as Instrument | undefined}
          dealers={(p.dealers as readonly Dealer[]) ?? []}
          onAccept={(p.onAccept as (id: number) => void) ?? ((): void => {})}
          onDismiss={p.onDismiss as ((id: number) => void) | undefined}
        />
      );
    },
  ],
  [
    RfqTilesPanel,
    (): ReactElement => {
      return <RfqTilesPanelComponent />;
    },
  ],
  [
    SellSidePanel,
    (): ReactElement => {
      return <SellSidePanelComponent />;
    },
  ],
  [
    TradeTicket,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <TradeTicketComponent
          rfq={p.rfq as Rfq}
          quote={p.quote as Quote}
          instrument={p.instrument as Instrument | undefined}
        />
      );
    },
  ],
  [
    CreditBlotter,
    (): ReactElement => {
      return <CreditBlotterComponent />;
    },
  ],
  [
    LiveRatesPanel,
    (): ReactElement => {
      return <LiveRatesPanelComponent />;
    },
  ],
  [
    CurrencyFilter,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <CurrencyFilterComponent
          selected={(p.selected as CurrencyCategory) ?? "All"}
          onChange={
            (p.onChange as (c: CurrencyCategory) => void) ?? ((): void => {})
          }
        />
      );
    },
  ],
  [
    LiveRatesWorkspace,
    (): ReactElement => {
      return (
        <>
          <LiveRatesHeadComponent />
          <LiveRatesPanelComponent />
        </>
      );
    },
  ],
  [
    Tile,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <TileComponent
          pair={p.pair as CurrencyPair}
          showChart={(p.showChart as boolean) ?? false}
        />
      );
    },
  ],
  [
    TileHeader,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <TileHeaderComponent
          base={p.base as string}
          terms={p.terms as string}
          symbol={(p.symbol as string) ?? ""}
          movement={(p.movement as PriceMovementType) ?? "NONE"}
          movementPips={
            p.movementPips === undefined ? 0 : (p.movementPips as number | null)
          }
        />
      );
    },
  ],
  [
    TilePrice,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <TilePriceComponent
          price={p.price as Price}
          ratePrecision={p.ratePrecision as number}
          pipsPosition={p.pipsPosition as number}
          anim={p.anim as "tickUp" | "tickDown" | undefined}
          spread={(p.spread as string) ?? ""}
          onExecute={
            (p.onExecute as (d: Direction) => void) ?? ((): void => {})
          }
          disabled={(p.disabled as boolean) ?? false}
        />
      );
    },
  ],
  [
    SpreadDisplay,
    (p: Record<string, unknown>): ReactElement => {
      return <SpreadDisplayComponent spread={p.spread as string} />;
    },
  ],
  [
    TileFooter,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <TileFooterComponent
          spotDate={(p.spotDate as string) ?? ""}
          notional={(p.notional as string) ?? ""}
          baseCurrency={(p.baseCurrency as string) ?? ""}
        />
      );
    },
  ],
  [
    TileNotional,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <TileNotionalComponent
          notional={p.notional as { state: NotionalView } & NotionalIntents}
          baseCurrency={p.baseCurrency as string}
          disabled={p.disabled as boolean | undefined}
        />
      );
    },
  ],
  [
    TileConfirmation,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <TileConfirmationComponent
          state={p.state as TileExecutionState}
          onDismiss={(p.onDismiss as () => void) ?? ((): void => {})}
        />
      );
    },
  ],
  [
    RfqCountdown,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <RfqCountdownComponent
          remainingMs={p.remainingMs as number}
          totalMs={p.totalMs as number}
        />
      );
    },
  ],
  [
    TileRfq,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <TileRfqComponent
          pair={p.pair as CurrencyPair}
          rfqState={p.rfqState as TileRfqState}
          onRequestQuote={(p.onRequestQuote as () => void) ?? ((): void => {})}
          onExecute={
            (p.onExecute as (
              direction: Direction,
              price: Price,
              notional: number,
            ) => void) ?? ((): void => {})
          }
          notional={(p.notional as number) ?? 0}
        />
      );
    },
  ],
  [
    ConnectionOverlay,
    (): ReactElement => {
      return <ConnectionOverlayComponent />;
    },
  ],
  [
    StatusBar,
    (): ReactElement => {
      return <StatusBarComponent />;
    },
  ],
  [
    HeaderChrome,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <HeaderChromeComponent
          activeTab={(p.activeTab as WorkspaceTab) ?? "fx"}
          onTabChange={
            (p.onTabChange as (t: WorkspaceTab) => void) ?? ((): void => {})
          }
        />
      );
    },
  ],
  [
    ThemePicker,
    (): ReactElement => {
      return <ThemePickerComponent />;
    },
  ],
  [
    StaleIndicator,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <StaleIndicatorComponent stale={(p.stale as boolean) ?? false}>
          <span>{(p.childLabel as string) ?? "content"}</span>
        </StaleIndicatorComponent>
      );
    },
  ],
  [
    ThemeToggle,
    (): ReactElement => {
      return <ThemeToggleComponent />;
    },
  ],
  [
    AdminPanel,
    (): ReactElement => {
      return <AdminPanelComponent />;
    },
  ],
  [
    LayoutEngine,
    (p: Record<string, unknown>): ReactElement => {
      const customHeadPanelIds =
        (p.customHeadPanelIds as readonly string[] | undefined) ?? [];
      const headRegistry: Partial<Record<PanelId, () => ReactElement>> = {};

      for (const id of customHeadPanelIds) {
        headRegistry[id] = (): ReactElement => {
          return <span data-testid="custom-head">Custom head for {id}</span>;
        };
      }

      return (
        <LayoutEngineHost
          headRegistry={headRegistry}
          pinnedFixture={(p.pinnedFixture as boolean | undefined) ?? false}
        />
      );
    },
  ],
  [
    LockScreen,
    (): ReactElement => {
      return <LockScreenComponent />;
    },
  ],
  [
    AmbientBackground,
    (): ReactElement => {
      return <AmbientBackgroundComponent />;
    },
  ],
  [
    PreferencesModal,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <PreferencesModalComponent
          open={(p.open as boolean) ?? false}
          onClose={(p.onClose as () => void) ?? ((): void => {})}
        />
      );
    },
  ],
  [
    OrderTicket,
    (p: Record<string, unknown>): ReactElement => {
      return <OrderTicketComponent symbol={(p.symbol as string) ?? "AAPL"} />;
    },
  ],
  [
    Watchlist,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <WatchlistComponent
          selectedSymbol={(p.selectedSymbol as string | null) ?? null}
          onSelect={
            (p.onSelect as (symbol: string) => void) ?? ((): void => {})
          }
        />
      );
    },
  ],
  [
    OrdersBlotter,
    (): ReactElement => {
      return <OrdersBlotterComponent />;
    },
  ],
  [
    InstrumentTabs,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <InstrumentTabsComponent
          selectedSymbol={(p.selectedSymbol as string | null) ?? null}
          onSelect={
            (p.onSelect as (symbol: string) => void) ?? ((): void => {})
          }
        />
      );
    },
  ],
  [
    SectorHeatmap,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <SectorHeatmapComponent
          selectedSymbol={(p.selectedSymbol as string | null) ?? null}
          onSelect={
            (p.onSelect as (symbol: string) => void) ?? ((): void => {})
          }
        />
      );
    },
  ],
  [
    PriceChart,
    (p: Record<string, unknown>): ReactElement => {
      return <PriceChartComponent symbol={(p.symbol as string) ?? "AAPL"} />;
    },
  ],
  [
    DepthLadder,
    (p: Record<string, unknown>): ReactElement => {
      return <DepthLadderComponent symbol={(p.symbol as string) ?? "AAPL"} />;
    },
  ],
  [
    PositionsBlotter,
    (): ReactElement => {
      return <PositionsBlotterComponent />;
    },
  ],
  [
    DeskPnlGauge,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <DeskPnlGaugeComponent
          positions={(p.positions as readonly EquityPosition[]) ?? []}
        />
      );
    },
  ],
  [
    PnlSparkline,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <PnlSparklineComponent
          pnl={(p.pnl as number) ?? 0}
          maxAbsPnl={p.maxAbsPnl as number | undefined}
        />
      );
    },
  ],
  [
    EquitiesPanel,
    (): ReactElement => {
      return <EquitiesPanelComponent />;
    },
  ],
  // Admin / telemetry components (Phase 5 Task 8)
  [
    IncidentControls,
    (): ReactElement => {
      return <IncidentControlsComponent />;
    },
  ],
  [
    ServiceTopologyGraph,
    (): ReactElement => {
      return <ServiceTopologyGraphComponent />;
    },
  ],
  [
    LiveEventLog,
    (): ReactElement => {
      return <LiveEventLogComponent />;
    },
  ],
  [
    KpiRow,
    (): ReactElement => {
      return <KpiRowComponent />;
    },
  ],
  [
    ThroughputChart,
    (): ReactElement => {
      return <ThroughputChartComponent />;
    },
  ],
  [
    LatencyHistogram,
    (): ReactElement => {
      return <LatencyHistogramComponent />;
    },
  ],
  [
    SessionsPanel,
    (): ReactElement => {
      return <SessionsPanelComponent />;
    },
  ],
  [
    AdminDashboard,
    (): ReactElement => {
      return <AdminDashboardComponent />;
    },
  ],
]);
