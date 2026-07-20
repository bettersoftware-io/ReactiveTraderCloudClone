import type { AnalyticsDashboardPO } from "./AnalyticsDashboard";
import type { BlotterTablePO } from "./BlotterTable";
import type { BootPO } from "./Boot";
import type { ConnectionOverlayPO } from "./ConnectionOverlay";
import type { CreditRfqFormPO } from "./CreditRfqForm";
import type { CreditRfqPanelPO } from "./CreditRfqPanel";
import type { FooterPO } from "./Footer";
import type { FxRfqFormPO } from "./FxRfqForm";
import type { InspectorPO } from "./Inspector";
import type { LayoutPO } from "./Layout";
import type { LiveRatesTilePO } from "./LiveRatesTile";
import type { LoginScreenPO } from "./LoginScreen";
import type { PositionsPanelPO } from "./PositionsPanel";
import type { PowerSaverPO } from "./PowerSaver";
import type { ThemeTogglePO } from "./ThemeToggle";
import type { WorkspacePO } from "./Workspace";

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
  layout: LayoutPO;
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
