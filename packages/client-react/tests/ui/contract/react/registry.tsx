import type { ReactElement } from "react";

import type {
  CurrencyCategory,
  CurrencyPair,
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
import { PnlValue as PnlValueComponent } from "#/ui/fx/analytics/PnlValue";
import { BlotterHeader as BlotterHeaderComponent } from "#/ui/fx/blotter/BlotterHeader";
import { BlotterRow as BlotterRowComponent } from "#/ui/fx/blotter/BlotterRow";
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
  PnlValue,
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
    () => {
      return <AnalyticsPanelComponent />;
    },
  ],
  [
    PnlValue,
    (p) => {
      return <PnlValueComponent value={p.value as number} />;
    },
  ],
  [
    ConnectionStatusBar,
    () => {
      return <ConnectionStatusBarComponent />;
    },
  ],
  [
    FxBlotter,
    () => {
      return <FxBlotterComponent />;
    },
  ],
  [
    QuickFilter,
    (p) => {
      return (
        <QuickFilterComponent
          value={(p.value as string) ?? ""}
          onChange={(p.onChange as (v: string) => void) ?? (() => {})}
        />
      );
    },
  ],
  [
    BlotterRow,
    (p) => {
      return (
        <table>
          <tbody>
            <BlotterRowComponent
              trade={p.trade as Trade}
              isNew={(p.isNew as boolean) ?? false}
            />
          </tbody>
        </table>
      );
    },
  ],
  [
    BlotterHeader,
    (p) => {
      return (
        <table>
          <thead>
            <BlotterHeaderComponent
              sort={(p.sort as SortState) ?? { column: null, direction: null }}
              onSort={(p.onSort as (c: keyof Trade) => void) ?? (() => {})}
              filters={
                (p.filters as Map<keyof Trade, ColumnFilter>) ?? new Map()
              }
              onFilter={
                (p.onFilter as (
                  c: keyof Trade,
                  f: ColumnFilter | null,
                ) => void) ?? (() => {})
              }
              trades={(p.trades as readonly Trade[]) ?? []}
            />
          </thead>
        </table>
      );
    },
  ],
  [
    SetFilter,
    (p) => {
      return (
        <SetFilterComponent
          column={(p.column as keyof Trade) ?? "currencyPair"}
          trades={(p.trades as readonly Trade[]) ?? []}
          currentFilter={p.currentFilter as ColumnFilter | undefined}
          onApply={
            (p.onApply as (f: ColumnFilter | null) => void) ?? noopFilter
          }
        />
      );
    },
  ],
  [
    NumberFilter,
    (p) => {
      return (
        <NumberFilterComponent
          column={(p.column as keyof Trade) ?? "notional"}
          currentFilter={p.currentFilter as ColumnFilter | undefined}
          onApply={
            (p.onApply as (f: ColumnFilter | null) => void) ?? noopFilter
          }
        />
      );
    },
  ],
  [
    DateFilter,
    (p) => {
      return (
        <DateFilterComponent
          column={(p.column as keyof Trade) ?? "tradeDate"}
          currentFilter={p.currentFilter as ColumnFilter | undefined}
          onApply={
            (p.onApply as (f: ColumnFilter | null) => void) ?? noopFilter
          }
        />
      );
    },
  ],
  [
    NewRfqForm,
    (p) => {
      return (
        <NewRfqFormComponent
          onCreated={(p.onCreated as (id: number) => void) ?? (() => {})}
        />
      );
    },
  ],
  [
    RfqFilterTabs,
    (p) => {
      return (
        <RfqFilterTabsComponent
          selected={(p.selected as RfqFilter) ?? "Live"}
          onChange={(p.onChange as (f: RfqFilter) => void) ?? (() => {})}
        />
      );
    },
  ],
  [
    QuoteCard,
    (p) => {
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
    (p) => {
      return (
        <RfqCardComponent
          rfq={p.rfq as Rfq}
          quotes={(p.quotes as readonly Quote[]) ?? []}
          instrument={p.instrument as Instrument | undefined}
          dealers={(p.dealers as readonly Dealer[]) ?? []}
          onAccept={(p.onAccept as (id: number) => void) ?? (() => {})}
          onDismiss={p.onDismiss as ((id: number) => void) | undefined}
        />
      );
    },
  ],
  [
    RfqTilesPanel,
    () => {
      return <RfqTilesPanelComponent />;
    },
  ],
  [
    SellSidePanel,
    () => {
      return <SellSidePanelComponent />;
    },
  ],
  [
    TradeTicket,
    (p) => {
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
    () => {
      return <CreditBlotterComponent />;
    },
  ],
  [
    LiveRatesPanel,
    () => {
      return <LiveRatesPanelComponent />;
    },
  ],
  [
    CurrencyFilter,
    (p) => {
      return (
        <CurrencyFilterComponent
          selected={(p.selected as CurrencyCategory) ?? "All"}
          onChange={(p.onChange as (c: CurrencyCategory) => void) ?? (() => {})}
        />
      );
    },
  ],
  [
    ViewToggle,
    (p) => {
      return (
        <ViewToggleComponent
          mode={(p.mode as ViewMode) ?? "chart"}
          onChange={(p.onChange as (m: ViewMode) => void) ?? (() => {})}
        />
      );
    },
  ],
  [
    Tile,
    (p) => {
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
    (p) => {
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
    (p) => {
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
    (p) => {
      return <SpreadDisplayComponent spread={p.spread as string} />;
    },
  ],
  [
    TileExecution,
    (p) => {
      return (
        <TileExecutionComponent
          onExecute={(p.onExecute as (d: Direction) => void) ?? (() => {})}
          disabled={(p.disabled as boolean) ?? false}
        />
      );
    },
  ],
  [
    TileNotional,
    (p) => {
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
    (p) => {
      return (
        <TileConfirmationComponent
          state={p.state as TileExecutionState}
          onDismiss={(p.onDismiss as () => void) ?? (() => {})}
        />
      );
    },
  ],
  [
    RfqCountdown,
    (p) => {
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
    (p) => {
      return (
        <TileRfqComponent
          pair={p.pair as CurrencyPair}
          rfqState={p.rfqState as TileRfqState}
          onRequestQuote={(p.onRequestQuote as () => void) ?? (() => {})}
          onExecute={
            (p.onExecute as (
              direction: Direction,
              price: Price,
              notional: number,
            ) => void) ?? (() => {})
          }
          notional={(p.notional as number) ?? 0}
        />
      );
    },
  ],
  [
    ConnectionOverlay,
    () => {
      return <ConnectionOverlayComponent />;
    },
  ],
  [
    Footer,
    () => {
      return <FooterComponent />;
    },
  ],
  [
    Header,
    (p) => {
      return (
        <HeaderComponent
          activeTab={(p.activeTab as WorkspaceTab) ?? "fx"}
          onTabChange={
            (p.onTabChange as (t: WorkspaceTab) => void) ?? (() => {})
          }
        />
      );
    },
  ],
  [
    StaleIndicator,
    (p) => {
      return (
        <StaleIndicatorComponent stale={(p.stale as boolean) ?? false}>
          <span>{(p.childLabel as string) ?? "content"}</span>
        </StaleIndicatorComponent>
      );
    },
  ],
  [
    ThemeToggle,
    () => {
      return <ThemeToggleComponent />;
    },
  ],
  [
    AdminPanel,
    () => {
      return <AdminPanelComponent />;
    },
  ],
]);
