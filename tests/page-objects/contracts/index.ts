import type { WorkspacePO } from "./Workspace";
import type { ThemeTogglePO } from "./ThemeToggle";
import type { FooterPO } from "./Footer";
import type { ConnectionOverlayPO } from "./ConnectionOverlay";
import type { LiveRatesTilePO } from "./LiveRatesTile";
import type { FxRfqFormPO } from "./FxRfqForm";
import type { AnalyticsDashboardPO } from "./AnalyticsDashboard";
import type { CreditRfqFormPO } from "./CreditRfqForm";
import type { CreditRfqPanelPO } from "./CreditRfqPanel";
import type { BlotterTablePO } from "./BlotterTable";

export type {
  WorkspacePO,
  ThemeTogglePO,
  FooterPO,
  ConnectionOverlayPO,
  LiveRatesTilePO,
  FxRfqFormPO,
  AnalyticsDashboardPO,
  CreditRfqFormPO,
  CreditRfqPanelPO,
  BlotterTablePO,
};
export { TESTIDS } from "./testids";

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
