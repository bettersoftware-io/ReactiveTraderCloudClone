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
    // The section labels are static once the panel has data (waitVisible already
    // guarantees that). They sit inside the panel's `overflow: auto` body, so a
    // later section can be scrolled out of the viewport — present and reachable,
    // but not strictly in-view. Assert PRESENCE within the panel via the
    // retry-aware `cy.contains` (mirroring the Playwright PO's getByText), rather
    // than a single jQuery `:visible` snapshot that both races the panel's layout
    // and treats scrolled-out-but-present content as missing.
    return cy
      .get(`[data-testid="${TESTIDS.analytics.panel}"]`)
      .contains(name)
      .then(($el) => {
        return $el.length > 0;
      }) as unknown as Promise<boolean>;
  }
}
