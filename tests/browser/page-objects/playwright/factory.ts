import type { Page } from "@playwright/test";
import type { PageObjects } from "../contracts";
import { PlaywrightWorkspace } from "./Workspace";
import { PlaywrightThemeToggle } from "./ThemeToggle";
import { PlaywrightFooter } from "./Footer";
import { PlaywrightConnectionOverlay } from "./ConnectionOverlay";
import { PlaywrightLiveRatesTile } from "./LiveRatesTile";
import { PlaywrightFxRfqForm } from "./FxRfqForm";
import { PlaywrightAnalyticsDashboard } from "./AnalyticsDashboard";
import { PlaywrightCreditRfqForm } from "./CreditRfqForm";
import { PlaywrightCreditRfqPanel } from "./CreditRfqPanel";
import { PlaywrightBlotterTable } from "./BlotterTable";

export function buildPlaywrightPageObjects(page: Page): PageObjects {
  return {
    workspace: new PlaywrightWorkspace(page),
    themeToggle: new PlaywrightThemeToggle(page),
    footer: new PlaywrightFooter(page),
    connectionOverlay: new PlaywrightConnectionOverlay(page),
    liveRatesTile: new PlaywrightLiveRatesTile(page),
    fxRfqForm: new PlaywrightFxRfqForm(page),
    analyticsDashboard: new PlaywrightAnalyticsDashboard(page),
    creditRfqForm: new PlaywrightCreditRfqForm(page),
    creditRfqPanel: new PlaywrightCreditRfqPanel(page),
    blotterTable: new PlaywrightBlotterTable(page),
  };
}
