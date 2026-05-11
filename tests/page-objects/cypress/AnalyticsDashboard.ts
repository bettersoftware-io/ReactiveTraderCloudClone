import type { AnalyticsDashboardPO } from "../contracts/AnalyticsDashboard";
import { TESTIDS } from "../contracts/testids";

export class CypressAnalyticsDashboard implements AnalyticsDashboardPO {
  waitVisible(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.analytics.panel}"]`, { timeout: timeoutMs })
        .should("be.visible")
        .then(() => resolve());
    });
  }
  isVisible(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      cy.get(`[data-testid="${TESTIDS.analytics.panel}"]`)
        .then(($el) => resolve($el.is(":visible")));
    });
  }
  hasSection(name: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      cy.get("body").then(($body) => {
        const $panel = $body.find(`[data-testid="${TESTIDS.analytics.panel}"]`);
        if ($panel.length === 0) {
          resolve(false);
          return;
        }
        const $matches = $panel.find(":visible").filter((_, el) => {
          const text = el.textContent ?? "";
          return text.includes(name);
        });
        resolve($matches.length > 0);
      });
    });
  }
}
