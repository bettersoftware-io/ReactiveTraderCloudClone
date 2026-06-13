import type { ReactElement } from "react";
import type {
  Trade,
  CurrencyPair,
  Price,
  PriceTick,
  CurrencyCategory,
  Direction,
  Rfq,
  Quote,
  Instrument,
  Dealer,
} from "@rtc/domain";
import type { ComponentToken, MountedComponent } from "../shared/harness/component";
import {
  AnalyticsPanel,
  PnlValue,
  ConnectionStatusBar,
  FxBlotter,
  QuickFilter,
  BlotterRow,
  BlotterHeader,
  SetFilter,
  NumberFilter,
  DateFilter,
  NewRfqForm,
  RfqFilterTabs,
  QuoteCard,
  RfqCard,
  RfqTilesPanel,
  SellSidePanel,
  TradeTicket,
  CreditBlotter,
  LiveRatesPanel,
  CurrencyFilter,
  ViewToggle,
  Tile,
  TileHeader,
  TilePrice,
  SpreadDisplay,
  TileExecution,
  TileNotional,
  TileConfirmation,
  RfqCountdown,
  TileRfq,
} from "../shared/components";
import { LiveRatesPanel as LiveRatesPanelComponent } from "../../../../src/ui/fx/liveRates/LiveRatesPanel";
import { CurrencyFilter as CurrencyFilterComponent } from "../../../../src/ui/fx/liveRates/CurrencyFilter";
import { ViewToggle as ViewToggleComponent, type ViewMode } from "../../../../src/ui/fx/liveRates/ViewToggle";
import { Tile as TileComponent } from "../../../../src/ui/fx/liveRates/tile/Tile";
import { TileHeader as TileHeaderComponent } from "../../../../src/ui/fx/liveRates/tile/TileHeader";
import { TilePrice as TilePriceComponent, SpreadDisplay as SpreadDisplayComponent } from "../../../../src/ui/fx/liveRates/tile/TilePrice";
import { TileExecution as TileExecutionComponent } from "../../../../src/ui/fx/liveRates/tile/TileExecution";
import { TileNotional as TileNotionalComponent } from "../../../../src/ui/fx/liveRates/tile/TileNotional";
import type { UseNotionalResult } from "../../../../src/ui/fx/liveRates/tile/hooks/useNotional";
import { TileConfirmation as TileConfirmationComponent } from "../../../../src/ui/fx/liveRates/tile/TileConfirmation";
import type { TileState } from "../../../../src/ui/fx/liveRates/tile/hooks/useTileState";
import { RfqCountdown as RfqCountdownComponent } from "../../../../src/ui/fx/liveRates/tile/RfqCountdown";
import { TileRfq as TileRfqComponent } from "../../../../src/ui/fx/liveRates/tile/TileRfq";
import type { UseRfqStateResult } from "../../../../src/ui/fx/liveRates/tile/hooks/useRfqState";
import { AnalyticsPanel as AnalyticsPanelComponent } from "../../../../src/ui/fx/analytics/AnalyticsPanel";
import { PnlValue as PnlValueComponent } from "../../../../src/ui/fx/analytics/PnlValue";
import { ConnectionStatusBar as ConnectionStatusBarComponent } from "../../../../src/ui/shell/connection/ConnectionStatusBar";
import { FxBlotter as FxBlotterComponent } from "../../../../src/ui/fx/blotter/FxBlotter";
import { QuickFilter as QuickFilterComponent } from "../../../../src/ui/fx/blotter/QuickFilter";
import { BlotterRow as BlotterRowComponent } from "../../../../src/ui/fx/blotter/BlotterRow";
import { BlotterHeader as BlotterHeaderComponent } from "../../../../src/ui/fx/blotter/BlotterHeader";
import { SetFilter as SetFilterComponent } from "../../../../src/ui/fx/blotter/columnFilter/SetFilter";
import { NumberFilter as NumberFilterComponent } from "../../../../src/ui/fx/blotter/columnFilter/NumberFilter";
import { DateFilter as DateFilterComponent } from "../../../../src/ui/fx/blotter/columnFilter/DateFilter";
import type { ColumnFilter } from "../../../../src/ui/fx/blotter/columnFilter/filterState";
import type { SortState } from "../../../../src/ui/fx/blotter/columnSort";
import { NewRfqForm as NewRfqFormComponent } from "../../../../src/ui/credit/newRfq/NewRfqForm";
import { RfqFilterTabs as RfqFilterTabsComponent, type RfqFilter } from "../../../../src/ui/credit/rfqTiles/RfqFilterTabs";
import { QuoteCard as QuoteCardComponent } from "../../../../src/ui/credit/rfqTiles/QuoteCard";
import { RfqCard as RfqCardComponent } from "../../../../src/ui/credit/rfqTiles/RfqCard";
import { RfqTilesPanel as RfqTilesPanelComponent } from "../../../../src/ui/credit/rfqTiles/RfqTilesPanel";
import { SellSidePanel as SellSidePanelComponent } from "../../../../src/ui/credit/sellSide/SellSidePanel";
import { TradeTicket as TradeTicketComponent } from "../../../../src/ui/credit/sellSide/TradeTicket";
import { CreditBlotter as CreditBlotterComponent } from "../../../../src/ui/credit/blotter/CreditBlotter";

const noopFilter = (_f: ColumnFilter | null): void => {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyToken = ComponentToken<any, MountedComponent<any>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ElementFor = (props: Record<string, any>) => ReactElement;

/** token → React element factory. Identity-keyed; no string keys. */
export const registry = new Map<AnyToken, ElementFor>([
  [AnalyticsPanel, () => <AnalyticsPanelComponent />],
  [PnlValue, (p) => <PnlValueComponent value={p.value as number} />],
  [ConnectionStatusBar, () => <ConnectionStatusBarComponent />],
  [FxBlotter, () => <FxBlotterComponent />],
  [
    QuickFilter,
    (p) => (
      <QuickFilterComponent
        value={(p.value as string) ?? ""}
        onChange={(p.onChange as ((v: string) => void)) ?? (() => {})}
      />
    ),
  ],
  [
    BlotterRow,
    (p) => (
      <table>
        <tbody>
          <BlotterRowComponent trade={p.trade as Trade} isNew={(p.isNew as boolean) ?? false} />
        </tbody>
      </table>
    ),
  ],
  [
    BlotterHeader,
    (p) => (
      <table>
        <thead>
          <BlotterHeaderComponent
            sort={(p.sort as SortState) ?? { column: null, direction: null }}
            onSort={(p.onSort as ((c: keyof Trade) => void)) ?? (() => {})}
            filters={(p.filters as Map<keyof Trade, ColumnFilter>) ?? new Map()}
            onFilter={
              (p.onFilter as ((c: keyof Trade, f: ColumnFilter | null) => void)) ?? (() => {})
            }
            trades={(p.trades as readonly Trade[]) ?? []}
          />
        </thead>
      </table>
    ),
  ],
  [
    SetFilter,
    (p) => (
      <SetFilterComponent
        column={(p.column as keyof Trade) ?? "currencyPair"}
        trades={(p.trades as readonly Trade[]) ?? []}
        currentFilter={p.currentFilter as ColumnFilter | undefined}
        onApply={(p.onApply as ((f: ColumnFilter | null) => void)) ?? noopFilter}
      />
    ),
  ],
  [
    NumberFilter,
    (p) => (
      <NumberFilterComponent
        column={(p.column as keyof Trade) ?? "notional"}
        currentFilter={p.currentFilter as ColumnFilter | undefined}
        onApply={(p.onApply as ((f: ColumnFilter | null) => void)) ?? noopFilter}
      />
    ),
  ],
  [
    DateFilter,
    (p) => (
      <DateFilterComponent
        column={(p.column as keyof Trade) ?? "tradeDate"}
        currentFilter={p.currentFilter as ColumnFilter | undefined}
        onApply={(p.onApply as ((f: ColumnFilter | null) => void)) ?? noopFilter}
      />
    ),
  ],
  [NewRfqForm, (p) => <NewRfqFormComponent onCreated={(p.onCreated as ((id: number) => void)) ?? (() => {})} />],
  [
    RfqFilterTabs,
    (p) => (
      <RfqFilterTabsComponent
        selected={(p.selected as RfqFilter) ?? "Live"}
        onChange={(p.onChange as ((f: RfqFilter) => void)) ?? (() => {})}
      />
    ),
  ],
  [
    QuoteCard,
    (p) => (
      <QuoteCardComponent
        quote={p.quote as Quote}
        dealer={p.dealer as Dealer | undefined}
        onAccept={p.onAccept as ((id: number) => void) | undefined}
      />
    ),
  ],
  [
    RfqCard,
    (p) => (
      <RfqCardComponent
        rfq={p.rfq as Rfq}
        quotes={(p.quotes as readonly Quote[]) ?? []}
        instrument={p.instrument as Instrument | undefined}
        dealers={(p.dealers as readonly Dealer[]) ?? []}
        onAccept={(p.onAccept as ((id: number) => void)) ?? (() => {})}
        onDismiss={p.onDismiss as ((id: number) => void) | undefined}
      />
    ),
  ],
  [RfqTilesPanel, () => <RfqTilesPanelComponent />],
  [SellSidePanel, () => <SellSidePanelComponent />],
  [
    TradeTicket,
    (p) => (
      <TradeTicketComponent
        rfq={p.rfq as Rfq}
        quote={p.quote as Quote}
        instrument={p.instrument as Instrument | undefined}
      />
    ),
  ],
  [CreditBlotter, () => <CreditBlotterComponent />],
  [LiveRatesPanel, () => <LiveRatesPanelComponent />],
  [
    CurrencyFilter,
    (p) => (
      <CurrencyFilterComponent
        selected={(p.selected as CurrencyCategory) ?? "All"}
        onChange={(p.onChange as ((c: CurrencyCategory) => void)) ?? (() => {})}
      />
    ),
  ],
  [
    ViewToggle,
    (p) => (
      <ViewToggleComponent
        mode={(p.mode as ViewMode) ?? "chart"}
        onChange={(p.onChange as ((m: ViewMode) => void)) ?? (() => {})}
      />
    ),
  ],
  [
    Tile,
    (p) => (
      <TileComponent
        pair={p.pair as CurrencyPair}
        showChart={(p.showChart as boolean) ?? false}
      />
    ),
  ],
  [
    TileHeader,
    (p) => <TileHeaderComponent base={p.base as string} terms={p.terms as string} />,
  ],
  [
    TilePrice,
    (p) => (
      <TilePriceComponent
        price={p.price as Price}
        ratePrecision={p.ratePrecision as number}
        pipsPosition={p.pipsPosition as number}
      />
    ),
  ],
  [SpreadDisplay, (p) => <SpreadDisplayComponent spread={p.spread as string} />],
  [
    TileExecution,
    (p) => (
      <TileExecutionComponent
        onExecute={(p.onExecute as ((d: Direction) => void)) ?? (() => {})}
        disabled={(p.disabled as boolean) ?? false}
      />
    ),
  ],
  [
    TileNotional,
    (p) => (
      <TileNotionalComponent
        notional={p.notional as UseNotionalResult}
        baseCurrency={p.baseCurrency as string}
        disabled={p.disabled as boolean | undefined}
      />
    ),
  ],
  [
    TileConfirmation,
    (p) => (
      <TileConfirmationComponent
        state={p.state as TileState}
        onDismiss={(p.onDismiss as (() => void)) ?? (() => {})}
      />
    ),
  ],
  [
    RfqCountdown,
    (p) => (
      <RfqCountdownComponent
        remainingMs={p.remainingMs as number}
        totalMs={p.totalMs as number}
      />
    ),
  ],
  [
    TileRfq,
    (p) => (
      <TileRfqComponent
        pair={p.pair as CurrencyPair}
        rfqState={p.rfqState as UseRfqStateResult}
        onRequestQuote={(p.onRequestQuote as (() => void)) ?? (() => {})}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onExecute={(p.onExecute as any) ?? (() => {})}
        notional={(p.notional as number) ?? 0}
      />
    ),
  ],
]);
