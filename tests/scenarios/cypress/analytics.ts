// tests/scenarios/cypress/analytics.ts
// Cypress fork of tests/scenarios/analytics.ts — synchronous bodies, queue-aware.
// See Phase 5A.4 spec §3.3.
import type { TestContext } from "../../support/testContext";
import { assertTrue } from "../assert";
import { chainable } from "./_chainable";

export function expectAnalyticsPanelVisibleWithin(ctx: TestContext, seconds: number): void {
  void ctx.po.analyticsDashboard.waitVisible(seconds * 1_000);
}

export function expectAnalyticsHasSection(ctx: TestContext, name: string): void {
  chainable(ctx.po.analyticsDashboard.hasSection(name))
    .then((v) => assertTrue(v, `analytics section not found: ${name}`));
}
