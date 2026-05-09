export interface AnalyticsDashboardPO {
  waitVisible(timeoutMs: number): Promise<void>;
  isVisible(): Promise<boolean>;
  hasSection(name: string): Promise<boolean>;
}
