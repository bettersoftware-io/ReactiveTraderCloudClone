import type { AnalyticsDashboardPO } from "../contracts/AnalyticsDashboard";
import { TESTIDS } from "../contracts/testids";

export class CypressAnalyticsDashboard implements AnalyticsDashboardPO {
  waitVisible(timeoutMs: number): Promise<void> {
    return cy
      .get(`[data-testid="${TESTIDS.analytics.panel}"]`, { timeout: timeoutMs })
      .should("be.visible") as unknown as Promise<void>;
  }

  isVisible(): Promise<boolean> {
    return cy.get(`[data-testid="${TESTIDS.analytics.panel}"]`).then(($el) => {
      return $el.is(":visible");
    }) as unknown as Promise<boolean>;
  }

  hasSection(name: string): Promise<boolean> {
    return cy.get("body").then(($body) => {
      const $panel = $body.find(`[data-testid="${TESTIDS.analytics.panel}"]`);
      if ($panel.length === 0) return false;
      const $matches = $panel.find(":visible").filter((_, el) => {
        const text = el.textContent ?? "";
        return text.includes(name);
      });
      return $matches.length > 0;
    }) as unknown as Promise<boolean>;
  }
}
