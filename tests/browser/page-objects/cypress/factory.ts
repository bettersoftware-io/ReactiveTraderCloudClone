import type { PageObjects } from "../contracts";
import { CypressWorkspace } from "./Workspace";
import { CypressThemeToggle } from "./ThemeToggle";
import { CypressFooter } from "./Footer";
import { CypressConnectionOverlay } from "./ConnectionOverlay";
import { CypressLiveRatesTile } from "./LiveRatesTile";
import { CypressFxRfqForm } from "./FxRfqForm";
import { CypressAnalyticsDashboard } from "./AnalyticsDashboard";
import { CypressCreditRfqForm } from "./CreditRfqForm";
import { CypressCreditRfqPanel } from "./CreditRfqPanel";
import { CypressBlotterTable } from "./BlotterTable";

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
  };
}
