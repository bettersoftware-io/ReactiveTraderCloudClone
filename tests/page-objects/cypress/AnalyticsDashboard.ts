import type { AnalyticsDashboardPO } from "../contracts/AnalyticsDashboard";

function notYet(name: string): never {
  throw new Error(`CypressAnalyticsDashboard.${name}() not yet implemented (Phase 5A.2 task >10)`);
}

export class CypressAnalyticsDashboard implements AnalyticsDashboardPO {
  waitVisible(timeoutMs: number): Promise<void> { notYet("waitVisible"); }
  isVisible(): Promise<boolean> { notYet("isVisible"); }
  hasSection(name: string): Promise<boolean> { notYet("hasSection"); }
}
