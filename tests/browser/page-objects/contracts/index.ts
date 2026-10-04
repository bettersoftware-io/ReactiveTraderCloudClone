import type { AnalyticsDashboardPO } from "./AnalyticsDashboard.ts";
import type { BlotterTablePO } from "./BlotterTable.ts";
import type { BootPO } from "./Boot.ts";
import type { ConnectionOverlayPO } from "./ConnectionOverlay.ts";
import type { CreditRfqFormPO } from "./CreditRfqForm.ts";
import type { CreditRfqPanelPO } from "./CreditRfqPanel.ts";
import type { EquitiesChartPO } from "./EquitiesChart.ts";
import type { EquitiesWatchlistPO } from "./EquitiesWatchlist.ts";
import type { FooterPO } from "./Footer.ts";
import type { FxRfqFormPO } from "./FxRfqForm.ts";
import type { InspectorPO } from "./Inspector.ts";
import type { JarvisPO } from "./Jarvis.ts";
import type { LayoutPO } from "./Layout.ts";
import type { LiveRatesTilePO } from "./LiveRatesTile.ts";
import type { LoginScreenPO } from "./LoginScreen.ts";
import type { PositionsPanelPO } from "./PositionsPanel.ts";
import type { PowerSaverPO } from "./PowerSaver.ts";
import type { PreferencesPO } from "./Preferences.ts";
import type { ThemeTogglePO } from "./ThemeToggle.ts";
import type { WorkspacePO } from "./Workspace.ts";

export interface PageObjects {
  workspace: WorkspacePO;
  themeToggle: ThemeTogglePO;
  footer: FooterPO;
  connectionOverlay: ConnectionOverlayPO;
  liveRatesTile: LiveRatesTilePO;
  fxRfqForm: FxRfqFormPO;
  analyticsDashboard: AnalyticsDashboardPO;
  positionsPanel: PositionsPanelPO;
  creditRfqForm: CreditRfqFormPO;
  creditRfqPanel: CreditRfqPanelPO;
  blotterTable: BlotterTablePO;
  equitiesChart: EquitiesChartPO;
  equitiesWatchlist: EquitiesWatchlistPO;
  layout: LayoutPO;
  jarvis: JarvisPO;
  preferences: PreferencesPO;
  /** Optional: the same-origin DevTools inspector (a second page). Only the
   *  Playwright factory provides it. */
  inspector?: InspectorPO;
  /** Optional: the real LoginScreen form, opened in a fresh unauthenticated
   *  context. Only the Playwright factory provides it — every OTHER page
   *  object relies on the pre-authenticated seeded context. */
  login?: LoginScreenPO;
  /** Optional: the header power-saver quick toggle + document flag. Only the
   *  Playwright factory provides it (see {@link PowerSaverPO}). */
  powerSaver?: PowerSaverPO;
  /** Optional: the full-screen boot splash + the `forceBootAnimation`
   *  preference's real-browser effect on it. Only the Playwright factory
   *  provides it (see {@link BootPO}). */
  boot?: BootPO;
}
