import type { Page } from "@playwright/test";

import type { PageObjects } from "../contracts";
import { PlaywrightAnalyticsDashboard } from "./AnalyticsDashboard";
import { PlaywrightBlotterTable } from "./BlotterTable";
import { PlaywrightBoot } from "./Boot";
import { PlaywrightConnectionOverlay } from "./ConnectionOverlay";
import { PlaywrightCreditRfqForm } from "./CreditRfqForm";
import { PlaywrightCreditRfqPanel } from "./CreditRfqPanel";
import { PlaywrightFooter } from "./Footer";
import { PlaywrightFxRfqForm } from "./FxRfqForm";
import { PlaywrightInspector } from "./Inspector";
import { PlaywrightLayout } from "./Layout";
import { PlaywrightLiveRatesTile } from "./LiveRatesTile";
import { PlaywrightLoginScreen } from "./LoginScreen";
import { PlaywrightPositionsPanel } from "./PositionsPanel";
import { PlaywrightPowerSaver } from "./PowerSaver";
import { PlaywrightThemeToggle } from "./ThemeToggle";
import { PlaywrightWorkspace } from "./Workspace";

export function buildPlaywrightPageObjects(page: Page): PageObjects {
  return {
    workspace: new PlaywrightWorkspace(page),
    themeToggle: new PlaywrightThemeToggle(page),
    footer: new PlaywrightFooter(page),
    connectionOverlay: new PlaywrightConnectionOverlay(page),
    liveRatesTile: new PlaywrightLiveRatesTile(page),
    fxRfqForm: new PlaywrightFxRfqForm(page),
    analyticsDashboard: new PlaywrightAnalyticsDashboard(page),
    positionsPanel: new PlaywrightPositionsPanel(page),
    creditRfqForm: new PlaywrightCreditRfqForm(page),
    creditRfqPanel: new PlaywrightCreditRfqPanel(page),
    blotterTable: new PlaywrightBlotterTable(page),
    layout: new PlaywrightLayout(page),
    inspector: new PlaywrightInspector(page),
    login: new PlaywrightLoginScreen(page),
    powerSaver: new PlaywrightPowerSaver(page),
    boot: new PlaywrightBoot(page),
  };
}
