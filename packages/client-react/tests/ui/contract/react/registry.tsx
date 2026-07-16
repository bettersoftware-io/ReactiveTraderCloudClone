import {
  AdminDashboard,
  AdminHead,
  AdminPanel,
  AmbientBackground,
  AnalyticsHead,
  AnalyticsPanel,
  AnimationProbe,
  AuthGate,
  BlotterHeader,
  BlotterRow,
  BootGate,
  BootSequence,
  CandleChart,
  ChartPanel,
  ConnectionOverlay,
  ConnectionStatusBar,
  CreditBlotter,
  CreditBlotterHead,
  CreditBlotterWorkspace,
  CurrencyFilter,
  DateFilter,
  DepthLadder,
  DeskPnlGauge,
  EqBlotterHead,
  EqBlotterPanel,
  EqChartHead,
  EqDepthDock,
  EqSectorsDock,
  EqTicketHead,
  EqWatchlistHead,
  FxBlotter,
  FxBlotterWorkspace,
  HeaderChrome,
  IncidentControls,
  InstrumentHeader,
  InstrumentTabs,
  KpiRow,
  LatencyHistogram,
  LayoutEngine,
  LiveEventLog,
  LiveRatesPanel,
  LiveRatesWorkspace,
  LockScreen,
  LoginScreen,
  NewRfqHead,
  NewRfqPanel,
  NumberFilter,
  OrdersTable,
  OrderTicket,
  PairPnlBars,
  PnlChart,
  PnlSparkline,
  PnlValue,
  PositionsHead,
  PositionsPanel,
  PositionsTable,
  PreferencesModal,
  QuickFilter,
  RfqCountdown,
  RfqFilterPills,
  RfqsHead,
  RfqsPanel,
  SectorHeatmap,
  SellSidePanel,
  ServiceHealth,
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
  TimeframePills,
  TradeTicket,
  WatchlistPanel,
} from "@ui-contract/components";
import type {
  ComponentToken,
  MountedComponent,
} from "@ui-contract/harness/component";
import type { ReactElement } from "react";

import type {
  ColumnFilter,
  NotionalIntents,
  NotionalView,
  PanelId,
  SortState,
  TileExecutionState,
} from "@rtc/client-core";
import type {
  Candle,
  CandleTimeframe,
  CreditRfqFilter,
  CurrencyCategory,
  CurrencyPair,
  CurrencyPairPosition,
  Direction,
  EquityOrder,
  EquityPosition,
  EquityQuote,
  HistoricPosition,
  Instrument,
  Price,
  PriceMovementType,
  Quote,
  Rfq,
  Trade,
} from "@rtc/domain";
import type { ChartVm } from "@rtc/motion-core";

import { AdminDashboard as AdminDashboardComponent } from "#/ui/admin/AdminDashboard";
import { AdminHead as AdminHeadComponent } from "#/ui/admin/AdminHead";
import { AdminPanel as AdminPanelComponent } from "#/ui/admin/AdminPanel";
import { IncidentControls as IncidentControlsComponent } from "#/ui/admin/IncidentControls";
import { KpiRow as KpiRowComponent } from "#/ui/admin/kpis/KpiRow";
import { LatencyHistogram as LatencyHistogramComponent } from "#/ui/admin/LatencyHistogram";
import { LiveEventLog as LiveEventLogComponent } from "#/ui/admin/LiveEventLog";
import { ServiceTopologyGraph as ServiceTopologyGraphComponent } from "#/ui/admin/ServiceTopologyGraph";
import { SessionsPanel as SessionsPanelComponent } from "#/ui/admin/SessionsPanel";
import { ServiceHealth as ServiceHealthComponent } from "#/ui/admin/services/ServiceHealth";
import { ThroughputChart as ThroughputChartComponent } from "#/ui/admin/ThroughputChart";
import { CreditBlotter as CreditBlotterComponent } from "#/ui/credit/blotter/CreditBlotter";
import { CreditBlotterHead as CreditBlotterHeadComponent } from "#/ui/credit/blotter/CreditBlotterHead";
import { NewRfqHead as NewRfqHeadComponent } from "#/ui/credit/newRfq/NewRfqHead";
import { NewRfqPanel as NewRfqPanelComponent } from "#/ui/credit/newRfq/NewRfqPanel";
import { RfqFilterPills as RfqFilterPillsComponent } from "#/ui/credit/rfqs/RfqFilterPills";
import { RfqsHead as RfqsHeadComponent } from "#/ui/credit/rfqs/RfqsHead";
import { RfqsPanel as RfqsPanelComponent } from "#/ui/credit/rfqs/RfqsPanel";
import { SellSidePanel as SellSidePanelComponent } from "#/ui/credit/sellSide/SellSidePanel";
import { TradeTicket as TradeTicketComponent } from "#/ui/credit/sellSide/TradeTicket";
import { DeskPnlGauge as DeskPnlGaugeComponent } from "#/ui/equities/blotter/DeskPnlGauge";
import { EqBlotterHead as EqBlotterHeadComponent } from "#/ui/equities/blotter/EqBlotterHead";
import { EqBlotterPanel as EqBlotterPanelComponent } from "#/ui/equities/blotter/EqBlotterPanel";
import { OrdersTable as OrdersTableComponent } from "#/ui/equities/blotter/OrdersTable";
import { PnlSparkline as PnlSparklineComponent } from "#/ui/equities/blotter/PnlSparkline";
import { PositionsTable as PositionsTableComponent } from "#/ui/equities/blotter/PositionsTable";
import { CandleChart as CandleChartComponent } from "#/ui/equities/chart/CandleChart";
import { ChartPanel as ChartPanelComponent } from "#/ui/equities/chart/ChartPanel";
import { DepthLadder as DepthLadderComponent } from "#/ui/equities/chart/DepthLadder";
import { EqChartHead as EqChartHeadComponent } from "#/ui/equities/chart/EqChartHead";
import { EqDepthDock as EqDepthDockComponent } from "#/ui/equities/chart/EqDepthDock";
import { InstrumentHeader as InstrumentHeaderComponent } from "#/ui/equities/chart/InstrumentHeader";
import { TimeframePills as TimeframePillsComponent } from "#/ui/equities/chart/TimeframePills";
import { InstrumentTabs as InstrumentTabsComponent } from "#/ui/equities/tabs/InstrumentTabs";
import { EqTicketHead as EqTicketHeadComponent } from "#/ui/equities/ticket/EqTicketHead";
import { OrderTicket as OrderTicketComponent } from "#/ui/equities/ticket/OrderTicket";
import { EqSectorsDock as EqSectorsDockComponent } from "#/ui/equities/watchlist/EqSectorsDock";
import { EqWatchlistHead as EqWatchlistHeadComponent } from "#/ui/equities/watchlist/EqWatchlistHead";
import { SectorHeatmap as SectorHeatmapComponent } from "#/ui/equities/watchlist/SectorHeatmap";
import { WatchlistPanel as WatchlistPanelComponent } from "#/ui/equities/watchlist/WatchlistPanel";
import { AnalyticsHead as AnalyticsHeadComponent } from "#/ui/fx/analytics/AnalyticsHead";
import { AnalyticsPanel as AnalyticsPanelComponent } from "#/ui/fx/analytics/AnalyticsPanel";
import { PairPnlBars as PairPnlBarsComponent } from "#/ui/fx/analytics/PairPnlBars";
import { PnlChart as PnlChartComponent } from "#/ui/fx/analytics/PnlChart";
import { PnlValue as PnlValueComponent } from "#/ui/fx/analytics/PnlValue";
import { BlotterHeader as BlotterHeaderComponent } from "#/ui/fx/blotter/BlotterHeader";
import { BlotterRow as BlotterRowComponent } from "#/ui/fx/blotter/BlotterRow";
import { COLUMNS, formatFxCell } from "#/ui/fx/blotter/blotterColumns";
import { DateFilter as DateFilterComponent } from "#/ui/fx/blotter/columnFilter/DateFilter";
import { NumberFilter as NumberFilterComponent } from "#/ui/fx/blotter/columnFilter/NumberFilter";
import { SetFilter as SetFilterComponent } from "#/ui/fx/blotter/columnFilter/SetFilter";
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
import { AuthGate as AuthGateComponent } from "#/ui/shell/auth/AuthGate";
import { LoginScreen as LoginScreenComponent } from "#/ui/shell/auth/LoginScreen";
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
    AuthGate,
    (): ReactElement => {
      return (
        <AuthGateComponent>
          <div data-testid="auth-gate-child" />
        </AuthGateComponent>
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
    NewRfqPanel,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <NewRfqPanelComponent
          onCreated={(p.onCreated as (id: number) => void) ?? ((): void => {})}
        />
      );
    },
  ],
  [
    NewRfqHead,
    (): ReactElement => {
      return <NewRfqHeadComponent />;
    },
  ],
  [
    RfqsPanel,
    (): ReactElement => {
      return <RfqsPanelComponent />;
    },
  ],
  [
    RfqsHead,
    (): ReactElement => {
      return <RfqsHeadComponent />;
    },
  ],
  [
    RfqFilterPills,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <RfqFilterPillsComponent
          filter={(p.filter as CreditRfqFilter) ?? "live"}
          liveCount={(p.liveCount as string) ?? ""}
          onFilter={
            (p.onFilter as (f: CreditRfqFilter) => void) ?? ((): void => {})
          }
        />
      );
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
    CreditBlotterHead,
    (): ReactElement => {
      return <CreditBlotterHeadComponent />;
    },
  ],
  [
    CreditBlotterWorkspace,
    (): ReactElement => {
      return (
        <>
          <CreditBlotterHeadComponent />
          <CreditBlotterComponent />
        </>
      );
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
          onInitiateRfq={p.onInitiateRfq as (() => void) | undefined}
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
    LoginScreen,
    (): ReactElement => {
      return <LoginScreenComponent />;
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
      return <OrderTicketComponent symbol={p.symbol as string | undefined} />;
    },
  ],
  [
    InstrumentTabs,
    (): ReactElement => {
      return <InstrumentTabsComponent />;
    },
  ],
  [
    ChartPanel,
    (): ReactElement => {
      return <ChartPanelComponent />;
    },
  ],
  [
    InstrumentHeader,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <InstrumentHeaderComponent
          symbol={(p.symbol as string) ?? ""}
          instrumentName={p.instrumentName as string | undefined}
          exchange={p.exchange as string | undefined}
          quote={(p.quote as EquityQuote | null) ?? null}
          candles={(p.candles as readonly Candle[]) ?? []}
          flashOn={(p.flashOn as boolean) ?? false}
          flashDir={(p.flashDir as "up" | "down") ?? "up"}
        />
      );
    },
  ],
  [
    CandleChart,
    (p: Record<string, unknown>): ReactElement => {
      return <CandleChartComponent vm={p.vm as ChartVm} />;
    },
  ],
  [
    TimeframePills,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <TimeframePillsComponent
          tf={(p.tf as CandleTimeframe) ?? "1D"}
          onSet={(p.onSet as (tf: CandleTimeframe) => void) ?? ((): void => {})}
        />
      );
    },
  ],
  [
    EqChartHead,
    (): ReactElement => {
      return <EqChartHeadComponent />;
    },
  ],
  [
    WatchlistPanel,
    (): ReactElement => {
      return <WatchlistPanelComponent />;
    },
  ],
  [
    EqWatchlistHead,
    (): ReactElement => {
      return <EqWatchlistHeadComponent />;
    },
  ],
  [
    EqTicketHead,
    (): ReactElement => {
      return <EqTicketHeadComponent />;
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
    DepthLadder,
    (p: Record<string, unknown>): ReactElement => {
      return <DepthLadderComponent symbol={(p.symbol as string) ?? "AAPL"} />;
    },
  ],
  [
    EqDepthDock,
    (): ReactElement => {
      return <EqDepthDockComponent />;
    },
  ],
  [
    EqSectorsDock,
    (): ReactElement => {
      return <EqSectorsDockComponent />;
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
    OrdersTable,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <OrdersTableComponent
          orders={(p.orders as readonly EquityOrder[]) ?? []}
          newOrderId={(p.newOrderId as string | null) ?? null}
        />
      );
    },
  ],
  [
    PositionsTable,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <PositionsTableComponent
          positions={(p.positions as readonly EquityPosition[]) ?? []}
        />
      );
    },
  ],
  [
    EqBlotterPanel,
    (): ReactElement => {
      return <EqBlotterPanelComponent />;
    },
  ],
  [
    EqBlotterHead,
    (): ReactElement => {
      return <EqBlotterHeadComponent />;
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
    ServiceHealth,
    (): ReactElement => {
      return <ServiceHealthComponent />;
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
  [
    AdminHead,
    (): ReactElement => {
      return <AdminHeadComponent />;
    },
  ],
]);
