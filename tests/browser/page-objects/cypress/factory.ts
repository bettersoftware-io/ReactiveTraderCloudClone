import type { PageObjects } from "../contracts";
import { CypressAnalyticsDashboard } from "./AnalyticsDashboard";
import { CypressBlotterTable } from "./BlotterTable";
import { CypressConnectionOverlay } from "./ConnectionOverlay";
import { CypressCreditRfqForm } from "./CreditRfqForm";
import { CypressCreditRfqPanel } from "./CreditRfqPanel";
import { CypressFooter } from "./Footer";
import { CypressFxRfqForm } from "./FxRfqForm";
import { CypressLayout } from "./Layout";
import { CypressLiveRatesTile } from "./LiveRatesTile";
import { CypressThemeToggle } from "./ThemeToggle";
import { CypressWorkspace } from "./Workspace";

export function buildCypressPageObjects(): PageObjects {
  return {
    workspace: new CypressWorkspace(),
    themeToggle: new CypressThemeToggle(),
    footer: new CypressFooter(),
    connectionOverlay: new CypressConnectionOverlay(),
    liveRatesTile: new CypressLiveRatesTile(),
    fxRfqForm: new CypressFxRfqForm(),
    analyticsDashboard: new CypressAnalyticsDashboard(),
    creditRfqForm: new CypressCreditRfqForm(),
    creditRfqPanel: new CypressCreditRfqPanel(),
    blotterTable: new CypressBlotterTable(),
    layout: new CypressLayout(),
  };
}
