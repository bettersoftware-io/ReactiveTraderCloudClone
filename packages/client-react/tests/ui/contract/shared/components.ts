import { component } from "./harness/component";
import {
  NewRfqFormPage,
  type NewRfqFormProps,
} from "./pages/credit/newRfq/NewRfqFormPage";
import {
  NewRfqPanelPage,
  type NewRfqPanelProps,
} from "./pages/credit/newRfq/NewRfqPanelPage";
import {
  type RfqFilter,
  RfqFilterTabsPage,
  type RfqFilterTabsProps,
} from "./pages/credit/rfqTiles/RfqFilterTabsPage";
import { AnalyticsHeadPage } from "./pages/fx/analytics/AnalyticsHeadPage";
import { AnalyticsPanelPage } from "./pages/fx/analytics/AnalyticsPanelPage";
import {
  PairPnlBarsPage,
  type PairPnlBarsProps,
} from "./pages/fx/analytics/PairPnlBarsPage";
import {
  PnlChartPage,
  type PnlChartProps,
} from "./pages/fx/analytics/PnlChartPage";
import {
  PnlValuePage,
  type PnlValueProps,
} from "./pages/fx/analytics/PnlValuePage";
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
import { FxBlotterWorkspacePage } from "./pages/fx/blotter/FxBlotterWorkspacePage";
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
import { PositionsHeadPage } from "./pages/fx/positions/PositionsHeadPage";
import { PositionsPanelPage } from "./pages/fx/positions/PositionsPanelPage";
import { AmbientBackgroundPage } from "./pages/shell/background/AmbientBackgroundPage";
import { BootGatePage } from "./pages/shell/boot/BootGatePage";
import { BootSequencePage } from "./pages/shell/boot/BootSequencePage";
import { ConnectionStatusBarPage } from "./pages/shell/connection/ConnectionStatusBarPage";
import {
  LayoutEnginePage,
  type LayoutEngineProps,
} from "./pages/shell/layout/LayoutEnginePage";
import { LockScreenPage } from "./pages/shell/lock/LockScreenPage";
import {
  AnimationProbePage,
  type AnimationProbeProps,
} from "./pages/shell/motion/AnimationProbePage";

export type { RfqFilter };

import { AdminDashboardPage } from "./pages/admin/AdminDashboardPage";
import { AdminPanelPage } from "./pages/admin/AdminPanelPage";
import { ErrorRatePanelPage } from "./pages/admin/ErrorRatePanelPage";
import { IncidentControlsPage } from "./pages/admin/IncidentControlsPage";
import { LatencyHistogramPage } from "./pages/admin/LatencyHistogramPage";
import { LiveEventLogPage } from "./pages/admin/LiveEventLogPage";
import { MetricGaugesPage } from "./pages/admin/MetricGaugesPage";
import { ServiceTopologyGraphPage } from "./pages/admin/ServiceTopologyGraphPage";
import { SessionsPanelPage } from "./pages/admin/SessionsPanelPage";
import { ThroughputChartPage } from "./pages/admin/ThroughputChartPage";
import { CreditBlotterPage } from "./pages/credit/blotter/CreditBlotterPage";
import {
  RfqFilterPillsPage,
  type RfqFilterPillsProps,
} from "./pages/credit/rfqs/RfqFilterPillsPage";
import { RfqsPanelPage } from "./pages/credit/rfqs/RfqsPanelPage";
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
  DepthLadderPage,
  type DepthLadderProps,
} from "./pages/equities/DepthLadderPage";
import {
  DeskPnlGaugePage,
  type DeskPnlGaugeProps,
} from "./pages/equities/DeskPnlGaugePage";
import { EquitiesPanelPage } from "./pages/equities/EquitiesPanelPage";
import {
  InstrumentTabsPage,
  type InstrumentTabsProps,
} from "./pages/equities/InstrumentTabsPage";
import { OrdersBlotterPage } from "./pages/equities/OrdersBlotterPage";
import {
  OrderTicketPage,
  type OrderTicketProps,
} from "./pages/equities/OrderTicketPage";
import {
  PnlSparklinePage,
  type PnlSparklineProps,
} from "./pages/equities/PnlSparklinePage";
import { PositionsBlotterPage } from "./pages/equities/PositionsBlotterPage";
import {
  PriceChartPage,
  type PriceChartProps,
} from "./pages/equities/PriceChartPage";
import {
  SectorHeatmapPage,
  type SectorHeatmapProps,
} from "./pages/equities/SectorHeatmapPage";
import {
  WatchlistPage,
  type WatchlistProps,
} from "./pages/equities/WatchlistPage";
import {
  CurrencyFilterPage,
  type CurrencyFilterProps,
} from "./pages/fx/liveRates/CurrencyFilterPage";
import { LiveRatesPanelPage } from "./pages/fx/liveRates/LiveRatesPanelPage";
import { LiveRatesWorkspacePage } from "./pages/fx/liveRates/LiveRatesWorkspacePage";
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
  TileFooterPage,
  type TileFooterProps,
} from "./pages/fx/liveRates/tile/TileFooterPage";
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
  HeaderChromePage,
  type HeaderChromeProps,
} from "./pages/shell/chrome/HeaderChromePage";
import { ThemePickerPage } from "./pages/shell/chrome/ThemePickerPage";
import { ConnectionOverlayPage } from "./pages/shell/connection/ConnectionOverlayPage";
import {
  PreferencesModalPage,
  type PreferencesModalProps,
} from "./pages/shell/prefs/PreferencesModalPage";
import {
  StaleIndicatorPage,
  type StaleIndicatorProps,
} from "./pages/shell/stale/StaleIndicatorPage";
import { StatusBarPage } from "./pages/shell/status/StatusBarPage";
import { ThemeTogglePage } from "./pages/shell/theme/ThemeTogglePage";

export const AnalyticsPanel = component<
  Record<string, never>,
  AnalyticsPanelPage
>((ctx) => {
  return new AnalyticsPanelPage(ctx);
});

export const AnalyticsHead = component<
  Record<string, never>,
  AnalyticsHeadPage
>((ctx) => {
  return new AnalyticsHeadPage(ctx);
});

export const PairPnlBars = component<PairPnlBarsProps, PairPnlBarsPage>(
  (ctx) => {
    return new PairPnlBarsPage(ctx);
  },
);

export const PnlValue = component<PnlValueProps, PnlValuePage>((ctx) => {
  return new PnlValuePage(ctx);
});

export const PnlChart = component<PnlChartProps, PnlChartPage>((ctx) => {
  return new PnlChartPage(ctx);
});

export const PositionsPanel = component<
  Record<string, never>,
  PositionsPanelPage
>((ctx) => {
  return new PositionsPanelPage(ctx);
});

export const PositionsHead = component<
  Record<string, never>,
  PositionsHeadPage
>((ctx) => {
  return new PositionsHeadPage(ctx);
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

export const FxBlotterWorkspace = component<
  Record<string, never>,
  FxBlotterWorkspacePage
>((ctx) => {
  return new FxBlotterWorkspacePage(ctx);
});

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

export const NewRfqPanel = component<NewRfqPanelProps, NewRfqPanelPage>(
  (ctx) => {
    return new NewRfqPanelPage(ctx);
  },
);

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

export const RfqsPanel = component<Record<string, never>, RfqsPanelPage>(
  (ctx) => {
    return new RfqsPanelPage(ctx);
  },
);

export const RfqFilterPills = component<
  RfqFilterPillsProps,
  RfqFilterPillsPage
>((ctx) => {
  return new RfqFilterPillsPage(ctx);
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

export const LiveRatesWorkspace = component<
  Record<string, never>,
  LiveRatesWorkspacePage
>((ctx) => {
  return new LiveRatesWorkspacePage(ctx);
});

export const CurrencyFilter = component<
  CurrencyFilterProps,
  CurrencyFilterPage
>((ctx) => {
  return new CurrencyFilterPage(ctx);
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

export const TileFooter = component<TileFooterProps, TileFooterPage>((ctx) => {
  return new TileFooterPage(ctx);
});

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

export const StatusBar = component<Record<string, never>, StatusBarPage>(
  (ctx) => {
    return new StatusBarPage(ctx);
  },
);

export const HeaderChrome = component<HeaderChromeProps, HeaderChromePage>(
  (ctx) => {
    return new HeaderChromePage(ctx);
  },
);

export const ThemePicker = component<Record<string, never>, ThemePickerPage>(
  (ctx) => {
    return new ThemePickerPage(ctx);
  },
);

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

export const LayoutEngine = component<LayoutEngineProps, LayoutEnginePage>(
  (ctx) => {
    return new LayoutEnginePage(ctx);
  },
);

export const BootSequence = component<Record<string, never>, BootSequencePage>(
  (ctx) => {
    return new BootSequencePage(ctx);
  },
);

export const BootGate = component<Record<string, never>, BootGatePage>(
  (ctx) => {
    return new BootGatePage(ctx);
  },
);

export const LockScreen = component<Record<string, never>, LockScreenPage>(
  (ctx) => {
    return new LockScreenPage(ctx);
  },
);

export const AmbientBackground = component<
  Record<string, never>,
  AmbientBackgroundPage
>((ctx) => {
  return new AmbientBackgroundPage(ctx);
});

export const PreferencesModal = component<
  PreferencesModalProps,
  PreferencesModalPage
>((ctx) => {
  return new PreferencesModalPage(ctx);
});

export const AnimationProbe = component<
  AnimationProbeProps,
  AnimationProbePage
>((ctx) => {
  return new AnimationProbePage(ctx);
});

export const OrderTicket = component<OrderTicketProps, OrderTicketPage>(
  (ctx) => {
    return new OrderTicketPage(ctx);
  },
);

export const Watchlist = component<WatchlistProps, WatchlistPage>((ctx) => {
  return new WatchlistPage(ctx);
});

export const OrdersBlotter = component<
  Record<string, never>,
  OrdersBlotterPage
>((ctx) => {
  return new OrdersBlotterPage(ctx);
});

export const InstrumentTabs = component<
  InstrumentTabsProps,
  InstrumentTabsPage
>((ctx) => {
  return new InstrumentTabsPage(ctx);
});

export const SectorHeatmap = component<SectorHeatmapProps, SectorHeatmapPage>(
  (ctx) => {
    return new SectorHeatmapPage(ctx);
  },
);

export const PriceChart = component<PriceChartProps, PriceChartPage>((ctx) => {
  return new PriceChartPage(ctx);
});

export const DepthLadder = component<DepthLadderProps, DepthLadderPage>(
  (ctx) => {
    return new DepthLadderPage(ctx);
  },
);

export const PositionsBlotter = component<
  Record<string, never>,
  PositionsBlotterPage
>((ctx) => {
  return new PositionsBlotterPage(ctx);
});

export const DeskPnlGauge = component<DeskPnlGaugeProps, DeskPnlGaugePage>(
  (ctx) => {
    return new DeskPnlGaugePage(ctx);
  },
);

export const PnlSparkline = component<PnlSparklineProps, PnlSparklinePage>(
  (ctx) => {
    return new PnlSparklinePage(ctx);
  },
);

export const EquitiesPanel = component<
  Record<string, never>,
  EquitiesPanelPage
>((ctx) => {
  return new EquitiesPanelPage(ctx);
});

// Admin / telemetry components (Phase 5 Task 8)
export const IncidentControls = component<
  Record<string, never>,
  IncidentControlsPage
>((ctx) => {
  return new IncidentControlsPage(ctx);
});

export const ServiceTopologyGraph = component<
  Record<string, never>,
  ServiceTopologyGraphPage
>((ctx) => {
  return new ServiceTopologyGraphPage(ctx);
});

export const LiveEventLog = component<Record<string, never>, LiveEventLogPage>(
  (ctx) => {
    return new LiveEventLogPage(ctx);
  },
);

export const MetricGauges = component<Record<string, never>, MetricGaugesPage>(
  (ctx) => {
    return new MetricGaugesPage(ctx);
  },
);

export const ThroughputChart = component<
  Record<string, never>,
  ThroughputChartPage
>((ctx) => {
  return new ThroughputChartPage(ctx);
});

export const LatencyHistogram = component<
  Record<string, never>,
  LatencyHistogramPage
>((ctx) => {
  return new LatencyHistogramPage(ctx);
});

export const ErrorRatePanel = component<
  Record<string, never>,
  ErrorRatePanelPage
>((ctx) => {
  return new ErrorRatePanelPage(ctx);
});

export const SessionsPanel = component<
  Record<string, never>,
  SessionsPanelPage
>((ctx) => {
  return new SessionsPanelPage(ctx);
});

export const AdminDashboard = component<
  Record<string, never>,
  AdminDashboardPage
>((ctx) => {
  return new AdminDashboardPage(ctx);
});
