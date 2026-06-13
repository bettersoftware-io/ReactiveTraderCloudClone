import { component } from "./harness/component";
import { AnalyticsPanelPage } from "./pages/fx/analytics/AnalyticsPanelPage";
import { PnlValuePage, type PnlValueProps } from "./pages/fx/analytics/PnlValuePage";
import { ConnectionStatusBarPage } from "./pages/shell/connection/ConnectionStatusBarPage";
import { FxBlotterPage } from "./pages/fx/blotter/FxBlotterPage";
import { QuickFilterPage, type QuickFilterProps } from "./pages/fx/blotter/QuickFilterPage";
import { BlotterRowPage, type BlotterRowProps } from "./pages/fx/blotter/BlotterRowPage";
import { BlotterHeaderPage, type BlotterHeaderProps } from "./pages/fx/blotter/BlotterHeaderPage";
import { SetFilterPage, type SetFilterProps } from "./pages/fx/blotter/SetFilterPage";
import { NumberFilterPage, type NumberFilterProps } from "./pages/fx/blotter/NumberFilterPage";
import { DateFilterPage, type DateFilterProps } from "./pages/fx/blotter/DateFilterPage";
import { NewRfqFormPage, type NewRfqFormProps } from "./pages/credit/newRfq/NewRfqFormPage";
import { RfqFilterTabsPage, type RfqFilterTabsProps, type RfqFilter } from "./pages/credit/rfqTiles/RfqFilterTabsPage";

export type { RfqFilter };
import { QuoteCardPage, type QuoteCardProps } from "./pages/credit/rfqTiles/QuoteCardPage";
import { RfqCardPage, type RfqCardProps } from "./pages/credit/rfqTiles/RfqCardPage";
import { RfqTilesPanelPage } from "./pages/credit/rfqTiles/RfqTilesPanelPage";
import { SellSidePanelPage } from "./pages/credit/sellSide/SellSidePanelPage";
import { TradeTicketPage, type TradeTicketProps } from "./pages/credit/sellSide/TradeTicketPage";
import { CreditBlotterPage } from "./pages/credit/blotter/CreditBlotterPage";
import { LiveRatesPanelPage } from "./pages/fx/liveRates/LiveRatesPanelPage";
import { CurrencyFilterPage, type CurrencyFilterProps } from "./pages/fx/liveRates/CurrencyFilterPage";
import { ViewTogglePage, type ViewToggleProps } from "./pages/fx/liveRates/ViewTogglePage";
import { TilePage, type TileProps } from "./pages/fx/liveRates/tile/TilePage";
import { TileHeaderPage, type TileHeaderProps } from "./pages/fx/liveRates/tile/TileHeaderPage";
import { TilePricePage, type TilePriceProps } from "./pages/fx/liveRates/tile/TilePricePage";
import { SpreadDisplayPage, type SpreadDisplayProps } from "./pages/fx/liveRates/tile/SpreadDisplayPage";
import { TileExecutionPage, type TileExecutionProps } from "./pages/fx/liveRates/tile/TileExecutionPage";
import { TileNotionalPage, type TileNotionalProps } from "./pages/fx/liveRates/tile/TileNotionalPage";
import { TileConfirmationPage, type TileConfirmationProps } from "./pages/fx/liveRates/tile/TileConfirmationPage";
import { RfqCountdownPage, type RfqCountdownProps } from "./pages/fx/liveRates/tile/RfqCountdownPage";
import { TileRfqPage, type TileRfqProps } from "./pages/fx/liveRates/tile/TileRfqPage";

export const AnalyticsPanel = component<Record<string, never>, AnalyticsPanelPage>(
  (ctx) => new AnalyticsPanelPage(ctx),
);

export const PnlValue = component<PnlValueProps, PnlValuePage>(
  (ctx) => new PnlValuePage(ctx),
);

export const ConnectionStatusBar = component<Record<string, never>, ConnectionStatusBarPage>(
  (ctx) => new ConnectionStatusBarPage(ctx),
);

export const FxBlotter = component<Record<string, never>, FxBlotterPage>(
  (ctx) => new FxBlotterPage(ctx),
);

export const QuickFilter = component<QuickFilterProps, QuickFilterPage>(
  (ctx) => new QuickFilterPage(ctx),
);

export const BlotterRow = component<BlotterRowProps, BlotterRowPage>(
  (ctx) => new BlotterRowPage(ctx),
);

export const BlotterHeader = component<BlotterHeaderProps, BlotterHeaderPage>(
  (ctx) => new BlotterHeaderPage(ctx),
);

export const SetFilter = component<SetFilterProps, SetFilterPage>(
  (ctx) => new SetFilterPage(ctx),
);

export const NumberFilter = component<NumberFilterProps, NumberFilterPage>(
  (ctx) => new NumberFilterPage(ctx),
);

export const DateFilter = component<DateFilterProps, DateFilterPage>(
  (ctx) => new DateFilterPage(ctx),
);

export const NewRfqForm = component<NewRfqFormProps, NewRfqFormPage>(
  (ctx) => new NewRfqFormPage(ctx),
);

export const RfqFilterTabs = component<RfqFilterTabsProps, RfqFilterTabsPage>(
  (ctx) => new RfqFilterTabsPage(ctx),
);

export const QuoteCard = component<QuoteCardProps, QuoteCardPage>(
  (ctx) => new QuoteCardPage(ctx),
);

export const RfqCard = component<RfqCardProps, RfqCardPage>(
  (ctx) => new RfqCardPage(ctx),
);

export const RfqTilesPanel = component<Record<string, never>, RfqTilesPanelPage>(
  (ctx) => new RfqTilesPanelPage(ctx),
);

export const SellSidePanel = component<Record<string, never>, SellSidePanelPage>(
  (ctx) => new SellSidePanelPage(ctx),
);

export const TradeTicket = component<TradeTicketProps, TradeTicketPage>(
  (ctx) => new TradeTicketPage(ctx),
);

export const CreditBlotter = component<Record<string, never>, CreditBlotterPage>(
  (ctx) => new CreditBlotterPage(ctx),
);

export const LiveRatesPanel = component<Record<string, never>, LiveRatesPanelPage>(
  (ctx) => new LiveRatesPanelPage(ctx),
);

export const CurrencyFilter = component<CurrencyFilterProps, CurrencyFilterPage>(
  (ctx) => new CurrencyFilterPage(ctx),
);

export const ViewToggle = component<ViewToggleProps, ViewTogglePage>(
  (ctx) => new ViewTogglePage(ctx),
);

export const Tile = component<TileProps, TilePage>(
  (ctx) => new TilePage(ctx),
);

export const TileHeader = component<TileHeaderProps, TileHeaderPage>(
  (ctx) => new TileHeaderPage(ctx),
);

export const TilePrice = component<TilePriceProps, TilePricePage>(
  (ctx) => new TilePricePage(ctx),
);

export const SpreadDisplay = component<SpreadDisplayProps, SpreadDisplayPage>(
  (ctx) => new SpreadDisplayPage(ctx),
);

export const TileExecution = component<TileExecutionProps, TileExecutionPage>(
  (ctx) => new TileExecutionPage(ctx),
);

export const TileNotional = component<TileNotionalProps, TileNotionalPage>(
  (ctx) => new TileNotionalPage(ctx),
);

export const TileConfirmation = component<TileConfirmationProps, TileConfirmationPage>(
  (ctx) => new TileConfirmationPage(ctx),
);

export const RfqCountdown = component<RfqCountdownProps, RfqCountdownPage>(
  (ctx) => new RfqCountdownPage(ctx),
);

export const TileRfq = component<TileRfqProps, TileRfqPage>(
  (ctx) => new TileRfqPage(ctx),
);
