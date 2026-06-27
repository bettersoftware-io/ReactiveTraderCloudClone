import { component } from "./harness/component";
import {
  NewRfqFormPage,
  type NewRfqFormProps,
} from "./pages/credit/newRfq/NewRfqFormPage";
import {
  type RfqFilter,
  RfqFilterTabsPage,
  type RfqFilterTabsProps,
} from "./pages/credit/rfqTiles/RfqFilterTabsPage";
import { AnalyticsPanelPage } from "./pages/fx/analytics/AnalyticsPanelPage";
import {
  PairPnlBarsPage,
  type PairPnlBarsProps,
} from "./pages/fx/analytics/PairPnlBarsPage";
import {
  PnlValuePage,
  type PnlValueProps,
} from "./pages/fx/analytics/PnlValuePage";
import {
  PositionBubblesPage,
  type PositionBubblesProps,
} from "./pages/fx/analytics/PositionBubblesPage";
import {
  BlotterHeaderPage,
  type BlotterHeaderProps,
} from "./pages/fx/blotter/BlotterHeaderPage";
import {
  BlotterRowPage,
  type BlotterRowProps,
} from "./pages/fx/blotter/BlotterRowPage";
import {
  DateFilterPage,
  type DateFilterProps,
} from "./pages/fx/blotter/DateFilterPage";
import { FxBlotterPage } from "./pages/fx/blotter/FxBlotterPage";
import {
  NumberFilterPage,
  type NumberFilterProps,
} from "./pages/fx/blotter/NumberFilterPage";
import {
  QuickFilterPage,
  type QuickFilterProps,
} from "./pages/fx/blotter/QuickFilterPage";
import {
  SetFilterPage,
  type SetFilterProps,
} from "./pages/fx/blotter/SetFilterPage";
import { BootSequencePage } from "./pages/shell/boot/BootSequencePage";
import { ConnectionStatusBarPage } from "./pages/shell/connection/ConnectionStatusBarPage";
import { LayoutEnginePage } from "./pages/shell/layout/LayoutEnginePage";

export type { RfqFilter };

import { AdminPanelPage } from "./pages/admin/AdminPanelPage";
import { CreditBlotterPage } from "./pages/credit/blotter/CreditBlotterPage";
import {
  QuoteCardPage,
  type QuoteCardProps,
} from "./pages/credit/rfqTiles/QuoteCardPage";
import {
  RfqCardPage,
  type RfqCardProps,
} from "./pages/credit/rfqTiles/RfqCardPage";
import { RfqTilesPanelPage } from "./pages/credit/rfqTiles/RfqTilesPanelPage";
import { SellSidePanelPage } from "./pages/credit/sellSide/SellSidePanelPage";
import {
  TradeTicketPage,
  type TradeTicketProps,
} from "./pages/credit/sellSide/TradeTicketPage";
import {
  CurrencyFilterPage,
  type CurrencyFilterProps,
} from "./pages/fx/liveRates/CurrencyFilterPage";
import { LiveRatesPanelPage } from "./pages/fx/liveRates/LiveRatesPanelPage";
import {
  RfqCountdownPage,
  type RfqCountdownProps,
} from "./pages/fx/liveRates/tile/RfqCountdownPage";
import {
  SpreadDisplayPage,
  type SpreadDisplayProps,
} from "./pages/fx/liveRates/tile/SpreadDisplayPage";
import {
  TileConfirmationPage,
  type TileConfirmationProps,
} from "./pages/fx/liveRates/tile/TileConfirmationPage";
import {
  TileExecutionPage,
  type TileExecutionProps,
} from "./pages/fx/liveRates/tile/TileExecutionPage";
import {
  TileHeaderPage,
  type TileHeaderProps,
} from "./pages/fx/liveRates/tile/TileHeaderPage";
import {
  TileNotionalPage,
  type TileNotionalProps,
} from "./pages/fx/liveRates/tile/TileNotionalPage";
import { TilePage, type TileProps } from "./pages/fx/liveRates/tile/TilePage";
import {
  TilePricePage,
  type TilePriceProps,
} from "./pages/fx/liveRates/tile/TilePricePage";
import {
  TileRfqPage,
  type TileRfqProps,
} from "./pages/fx/liveRates/tile/TileRfqPage";
import {
  ViewTogglePage,
  type ViewToggleProps,
} from "./pages/fx/liveRates/ViewTogglePage";
import { ConnectionOverlayPage } from "./pages/shell/connection/ConnectionOverlayPage";
import { FooterPage } from "./pages/shell/layout/FooterPage";
import { HeaderPage, type HeaderProps } from "./pages/shell/layout/HeaderPage";
import {
  StaleIndicatorPage,
  type StaleIndicatorProps,
} from "./pages/shell/stale/StaleIndicatorPage";
import { ThemeTogglePage } from "./pages/shell/theme/ThemeTogglePage";

export const AnalyticsPanel = component<
  Record<string, never>,
  AnalyticsPanelPage
>((ctx) => {
  return new AnalyticsPanelPage(ctx);
});

export const PairPnlBars = component<PairPnlBarsProps, PairPnlBarsPage>(
  (ctx) => {
    return new PairPnlBarsPage(ctx);
  },
);

export const PnlValue = component<PnlValueProps, PnlValuePage>((ctx) => {
  return new PnlValuePage(ctx);
});

export const PositionBubbles = component<
  PositionBubblesProps,
  PositionBubblesPage
>((ctx) => {
  return new PositionBubblesPage(ctx);
});

export const ConnectionStatusBar = component<
  Record<string, never>,
  ConnectionStatusBarPage
>((ctx) => {
  return new ConnectionStatusBarPage(ctx);
});

export const FxBlotter = component<Record<string, never>, FxBlotterPage>(
  (ctx) => {
    return new FxBlotterPage(ctx);
  },
);

export const QuickFilter = component<QuickFilterProps, QuickFilterPage>(
  (ctx) => {
    return new QuickFilterPage(ctx);
  },
);

export const BlotterRow = component<BlotterRowProps, BlotterRowPage>((ctx) => {
  return new BlotterRowPage(ctx);
});

export const BlotterHeader = component<BlotterHeaderProps, BlotterHeaderPage>(
  (ctx) => {
    return new BlotterHeaderPage(ctx);
  },
);

export const SetFilter = component<SetFilterProps, SetFilterPage>((ctx) => {
  return new SetFilterPage(ctx);
});

export const NumberFilter = component<NumberFilterProps, NumberFilterPage>(
  (ctx) => {
    return new NumberFilterPage(ctx);
  },
);

export const DateFilter = component<DateFilterProps, DateFilterPage>((ctx) => {
  return new DateFilterPage(ctx);
});

export const NewRfqForm = component<NewRfqFormProps, NewRfqFormPage>((ctx) => {
  return new NewRfqFormPage(ctx);
});

export const RfqFilterTabs = component<RfqFilterTabsProps, RfqFilterTabsPage>(
  (ctx) => {
    return new RfqFilterTabsPage(ctx);
  },
);

export const QuoteCard = component<QuoteCardProps, QuoteCardPage>((ctx) => {
  return new QuoteCardPage(ctx);
});

export const RfqCard = component<RfqCardProps, RfqCardPage>((ctx) => {
  return new RfqCardPage(ctx);
});

export const RfqTilesPanel = component<
  Record<string, never>,
  RfqTilesPanelPage
>((ctx) => {
  return new RfqTilesPanelPage(ctx);
});

export const SellSidePanel = component<
  Record<string, never>,
  SellSidePanelPage
>((ctx) => {
  return new SellSidePanelPage(ctx);
});

export const TradeTicket = component<TradeTicketProps, TradeTicketPage>(
  (ctx) => {
    return new TradeTicketPage(ctx);
  },
);

export const CreditBlotter = component<
  Record<string, never>,
  CreditBlotterPage
>((ctx) => {
  return new CreditBlotterPage(ctx);
});

export const LiveRatesPanel = component<
  Record<string, never>,
  LiveRatesPanelPage
>((ctx) => {
  return new LiveRatesPanelPage(ctx);
});

export const CurrencyFilter = component<
  CurrencyFilterProps,
  CurrencyFilterPage
>((ctx) => {
  return new CurrencyFilterPage(ctx);
});

export const ViewToggle = component<ViewToggleProps, ViewTogglePage>((ctx) => {
  return new ViewTogglePage(ctx);
});

export const Tile = component<TileProps, TilePage>((ctx) => {
  return new TilePage(ctx);
});

export const TileHeader = component<TileHeaderProps, TileHeaderPage>((ctx) => {
  return new TileHeaderPage(ctx);
});

export const TilePrice = component<TilePriceProps, TilePricePage>((ctx) => {
  return new TilePricePage(ctx);
});

export const SpreadDisplay = component<SpreadDisplayProps, SpreadDisplayPage>(
  (ctx) => {
    return new SpreadDisplayPage(ctx);
  },
);

export const TileExecution = component<TileExecutionProps, TileExecutionPage>(
  (ctx) => {
    return new TileExecutionPage(ctx);
  },
);

export const TileNotional = component<TileNotionalProps, TileNotionalPage>(
  (ctx) => {
    return new TileNotionalPage(ctx);
  },
);

export const TileConfirmation = component<
  TileConfirmationProps,
  TileConfirmationPage
>((ctx) => {
  return new TileConfirmationPage(ctx);
});

export const RfqCountdown = component<RfqCountdownProps, RfqCountdownPage>(
  (ctx) => {
    return new RfqCountdownPage(ctx);
  },
);

export const TileRfq = component<TileRfqProps, TileRfqPage>((ctx) => {
  return new TileRfqPage(ctx);
});

export const ConnectionOverlay = component<
  Record<string, never>,
  ConnectionOverlayPage
>((ctx) => {
  return new ConnectionOverlayPage(ctx);
});

export const Footer = component<Record<string, never>, FooterPage>((ctx) => {
  return new FooterPage(ctx);
});

export const Header = component<HeaderProps, HeaderPage>((ctx) => {
  return new HeaderPage(ctx);
});

export const StaleIndicator = component<
  StaleIndicatorProps,
  StaleIndicatorPage
>((ctx) => {
  return new StaleIndicatorPage(ctx);
});

export const ThemeToggle = component<Record<string, never>, ThemeTogglePage>(
  (ctx) => {
    return new ThemeTogglePage(ctx);
  },
);

export const AdminPanel = component<Record<string, never>, AdminPanelPage>(
  (ctx) => {
    return new AdminPanelPage(ctx);
  },
);

export const LayoutEngine = component<Record<string, never>, LayoutEnginePage>(
  (ctx) => {
    return new LayoutEnginePage(ctx);
  },
);

export const BootSequence = component<Record<string, never>, BootSequencePage>(
  (ctx) => {
    return new BootSequencePage(ctx);
  },
);
