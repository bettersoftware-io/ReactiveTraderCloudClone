import type { Page } from "@playwright/test";
import type { AnalyticsDashboardPO } from "../contracts/AnalyticsDashboard";

export class PlaywrightAnalyticsDashboard implements AnalyticsDashboardPO {
  constructor(private readonly page: Page) {}
  waitVisible(_t: number): Promise<void> { throw notYet("AnalyticsDashboard.waitVisible"); }
  isVisible(): Promise<boolean> { throw notYet("AnalyticsDashboard.isVisible"); }
  hasSection(_n: string): Promise<boolean> { throw notYet("AnalyticsDashboard.hasSection"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
