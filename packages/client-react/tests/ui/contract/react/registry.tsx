import type { ReactElement } from "react";

import type {
  CurrencyCategory,
  CurrencyPair,
  CurrencyPairPosition,
  Dealer,
  Direction,
  Instrument,
  Price,
  Quote,
  Rfq,
  Trade,
  ViewMode,
} from "@rtc/domain";

import type {
  NotionalIntents,
  NotionalView,
} from "#/app/presenters/NotionalMachine";
import type { TileExecutionState } from "#/app/presenters/TileExecutionMachine";
import { AdminPanel as AdminPanelComponent } from "#/ui/admin/AdminPanel";
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
import { AnalyticsPanel as AnalyticsPanelComponent } from "#/ui/fx/analytics/AnalyticsPanel";
import { PairPnlBars as PairPnlBarsComponent } from "#/ui/fx/analytics/PairPnlBars";
import { PnlValue as PnlValueComponent } from "#/ui/fx/analytics/PnlValue";
import { PositionBubbles as PositionBubblesComponent } from "#/ui/fx/analytics/PositionBubbles";
import { BlotterHeader as BlotterHeaderComponent } from "#/ui/fx/blotter/BlotterHeader";
import { BlotterRow as BlotterRowComponent } from "#/ui/fx/blotter/BlotterRow";
import { COLUMNS, formatFxCell } from "#/ui/fx/blotter/blotterColumns";
import { DateFilter as DateFilterComponent } from "#/ui/fx/blotter/columnFilter/DateFilter";
import type { ColumnFilter } from "#/ui/fx/blotter/columnFilter/filterState";
import { NumberFilter as NumberFilterComponent } from "#/ui/fx/blotter/columnFilter/NumberFilter";
import { SetFilter as SetFilterComponent } from "#/ui/fx/blotter/columnFilter/SetFilter";
import type { SortState } from "#/ui/fx/blotter/columnSort";
import { FxBlotter as FxBlotterComponent } from "#/ui/fx/blotter/FxBlotter";
import { QuickFilter as QuickFilterComponent } from "#/ui/fx/blotter/QuickFilter";
import { CurrencyFilter as CurrencyFilterComponent } from "#/ui/fx/liveRates/CurrencyFilter";
import { LiveRatesPanel as LiveRatesPanelComponent } from "#/ui/fx/liveRates/LiveRatesPanel";
import { RfqCountdown as RfqCountdownComponent } from "#/ui/fx/liveRates/tile/RfqCountdown";
import { Tile as TileComponent } from "#/ui/fx/liveRates/tile/Tile";
import { TileConfirmation as TileConfirmationComponent } from "#/ui/fx/liveRates/tile/TileConfirmation";
import { TileExecution as TileExecutionComponent } from "#/ui/fx/liveRates/tile/TileExecution";
import { TileHeader as TileHeaderComponent } from "#/ui/fx/liveRates/tile/TileHeader";
import { TileNotional as TileNotionalComponent } from "#/ui/fx/liveRates/tile/TileNotional";
import {
  SpreadDisplay as SpreadDisplayComponent,
  TilePrice as TilePriceComponent,
} from "#/ui/fx/liveRates/tile/TilePrice";
import {
  TileRfq as TileRfqComponent,
  type TileRfqState,
} from "#/ui/fx/liveRates/tile/TileRfq";
import { ViewToggle as ViewToggleComponent } from "#/ui/fx/liveRates/ViewToggle";
import { ConnectionOverlay as ConnectionOverlayComponent } from "#/ui/shell/connection/ConnectionOverlay";
import { ConnectionStatusBar as ConnectionStatusBarComponent } from "#/ui/shell/connection/ConnectionStatusBar";
import { Footer as FooterComponent } from "#/ui/shell/layout/Footer";
import {
  Header as HeaderComponent,
  type WorkspaceTab,
} from "#/ui/shell/layout/Header";
import { StaleIndicator as StaleIndicatorComponent } from "#/ui/shell/stale/StaleIndicator";
import { ThemeToggle as ThemeToggleComponent } from "#/ui/shell/theme/ThemeToggle";

import {
  AdminPanel,
  AnalyticsPanel,
  BlotterHeader,
  BlotterRow,
  ConnectionOverlay,
  ConnectionStatusBar,
  CreditBlotter,
  CurrencyFilter,
  DateFilter,
  Footer,
  FxBlotter,
  Header,
  LiveRatesPanel,
  NewRfqForm,
  NumberFilter,
  PairPnlBars,
  PnlValue,
  PositionBubbles,
  QuickFilter,
  QuoteCard,
  RfqCard,
  RfqCountdown,
  RfqFilterTabs,
  RfqTilesPanel,
  SellSidePanel,
  SetFilter,
  SpreadDisplay,
  StaleIndicator,
  ThemeToggle,
  Tile,
  TileConfirmation,
  TileExecution,
  TileHeader,
  TileNotional,
  TilePrice,
  TileRfq,
  TradeTicket,
  ViewToggle,
} from "../shared/components";
import type {
  ComponentToken,
  MountedComponent,
} from "../shared/harness/component";

function noopFilter(_f: ColumnFilter | null): void {}

type AnyToken = ComponentToken<unknown, MountedComponent<unknown>>;
type ElementFor = (props: Record<string, unknown>) => ReactElement;

/** token → React element factory. Identity-keyed; no string keys. */
export const registry = new Map<AnyToken, ElementFor>([
  [
    AnalyticsPanel,
    (): ReactElement => {
      return <AnalyticsPanelComponent />;
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
    PositionBubbles,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <PositionBubblesComponent
          positions={(p.positions as readonly CurrencyPairPosition[]) ?? []}
        />
      );
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
    ViewToggle,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <ViewToggleComponent
          mode={(p.mode as ViewMode) ?? "chart"}
          onChange={(p.onChange as (m: ViewMode) => void) ?? ((): void => {})}
        />
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
    TileExecution,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <TileExecutionComponent
          onExecute={
            (p.onExecute as (d: Direction) => void) ?? ((): void => {})
          }
          disabled={(p.disabled as boolean) ?? false}
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
    Footer,
    (): ReactElement => {
      return <FooterComponent />;
    },
  ],
  [
    Header,
    (p: Record<string, unknown>): ReactElement => {
      return (
        <HeaderComponent
          activeTab={(p.activeTab as WorkspaceTab) ?? "fx"}
          onTabChange={
            (p.onTabChange as (t: WorkspaceTab) => void) ?? ((): void => {})
          }
        />
      );
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
]);
