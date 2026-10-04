import type { Page } from "@playwright/test";

import type { PageObjects } from "../contracts/index.ts";
import { PlaywrightAnalyticsDashboard } from "./AnalyticsDashboard.ts";
import { PlaywrightBlotterTable } from "./BlotterTable.ts";
import { PlaywrightBoot } from "./Boot.ts";
import { PlaywrightConnectionOverlay } from "./ConnectionOverlay.ts";
import { PlaywrightCreditRfqForm } from "./CreditRfqForm.ts";
import { PlaywrightCreditRfqPanel } from "./CreditRfqPanel.ts";
import { PlaywrightEquitiesChart } from "./EquitiesChart.ts";
import { PlaywrightEquitiesWatchlist } from "./EquitiesWatchlist.ts";
import { PlaywrightFooter } from "./Footer.ts";
import { PlaywrightFxRfqForm } from "./FxRfqForm.ts";
import { PlaywrightInspector } from "./Inspector.ts";
import { PlaywrightJarvis } from "./Jarvis.ts";
import { PlaywrightLayout } from "./Layout.ts";
import { PlaywrightLiveRatesTile } from "./LiveRatesTile.ts";
import { PlaywrightLoginScreen } from "./LoginScreen.ts";
import { PlaywrightPositionsPanel } from "./PositionsPanel.ts";
import { PlaywrightPowerSaver } from "./PowerSaver.ts";
import { PlaywrightPreferences } from "./Preferences.ts";
import { PlaywrightThemeToggle } from "./ThemeToggle.ts";
import { PlaywrightWorkspace } from "./Workspace.ts";

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
    equitiesChart: new PlaywrightEquitiesChart(page),
    equitiesWatchlist: new PlaywrightEquitiesWatchlist(page),
    layout: new PlaywrightLayout(page),
    jarvis: new PlaywrightJarvis(page),
    preferences: new PlaywrightPreferences(page),
    inspector: new PlaywrightInspector(page),
    login: new PlaywrightLoginScreen(page),
    powerSaver: new PlaywrightPowerSaver(page),
    boot: new PlaywrightBoot(page),
  };
}
