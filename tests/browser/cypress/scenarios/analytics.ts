// tests/browser/cypress/scenarios/analytics.ts
// Cypress fork of tests/browser/scenarios/analytics.ts — synchronous bodies, queue-aware.
// See Phase 5A.4 spec §3.3.

import { assertGte, assertTrue } from "#/browser/scenarios/assert";
import type { TestContext } from "#/browser/testContext";

import { chainable } from "./_chainable";

export function expectAnalyticsPanelVisibleWithin(
  ctx: TestContext,
  seconds: number,
): void {
  void ctx.po.analyticsDashboard.waitVisible(seconds * 1_000);
}

export function expectAnalyticsHasSection(
  ctx: TestContext,
  name: string,
): void {
  chainable(ctx.po.analyticsDashboard.hasSection(name)).then((v) => {
    return assertTrue(v, `analytics section not found: ${name}`);
  });
}

export function expectPositionsPanelVisibleWithin(
  ctx: TestContext,
  seconds: number,
): void {
  void ctx.po.positionsPanel.waitVisible(seconds * 1_000);
}

export function expectPositionsPanelHasBubbles(
  ctx: TestContext,
  minCount: number,
): void {
  chainable(ctx.po.positionsPanel.bubbleCount()).then((n) => {
    return assertGte(n, minCount);
  });
}

const SIGNED_AMOUNT_PATTERN = /[+-]\d+(\.\d+)?M/;

export function expectFirstBubbleHasSignedAmount(ctx: TestContext): void {
  chainable(ctx.po.positionsPanel.firstBubbleSign()).then((sign) => {
    assertTrue(
      sign === "pos" || sign === "neg",
      `expected first exposure bubble to carry a pos/neg data-sign, got ${String(sign)}`,
    );
  });
  chainable(ctx.po.positionsPanel.firstBubbleText()).then((text) => {
    assertTrue(
      SIGNED_AMOUNT_PATTERN.test(text),
      `first exposure bubble text "${text}" did not contain a signed millions amount`,
    );
  });
}

export function expectFirstRowHasSignedAmount(ctx: TestContext): void {
  chainable(ctx.po.positionsPanel.firstRowSign()).then((sign) => {
    assertTrue(
      sign === "pos" || sign === "neg",
      `expected first exposure ladder row to carry a pos/neg data-sign, got ${String(sign)}`,
    );
  });
  chainable(ctx.po.positionsPanel.firstRowText()).then((text) => {
    assertTrue(
      SIGNED_AMOUNT_PATTERN.test(text),
      `first exposure ladder row text "${text}" did not contain a signed millions amount`,
    );
  });
}
