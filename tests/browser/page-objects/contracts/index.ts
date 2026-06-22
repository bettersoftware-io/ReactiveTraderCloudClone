import type { AnalyticsDashboardPO } from "./AnalyticsDashboard";
import type { BlotterTablePO } from "./BlotterTable";
import type { ConnectionOverlayPO } from "./ConnectionOverlay";
import type { CreditRfqFormPO } from "./CreditRfqForm";
import type { CreditRfqPanelPO } from "./CreditRfqPanel";
import type { FooterPO } from "./Footer";
import type { FxRfqFormPO } from "./FxRfqForm";
import type { LiveRatesTilePO } from "./LiveRatesTile";
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
  creditRfqForm: CreditRfqFormPO;
  creditRfqPanel: CreditRfqPanelPO;
  blotterTable: BlotterTablePO;
}
