import type { TestContext } from "../testContext";
import { assertGte, assertTrue } from "./assert";

export async function expectAnalyticsPanelVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.analyticsDashboard.waitVisible(seconds * 1_000);
}

export async function expectAnalyticsHasSection(
  ctx: TestContext,
  name: string,
): Promise<void> {
  assertTrue(
    await ctx.po.analyticsDashboard.hasSection(name),
    `analytics section not found: ${name}`,
  );
}

export async function expectPositionsPanelVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.positionsPanel.waitVisible(seconds * 1_000);
}

export async function expectPositionsPanelHasBubbles(
  ctx: TestContext,
  minCount: number,
): Promise<void> {
  assertGte(await ctx.po.positionsPanel.bubbleCount(), minCount);
}

const SIGNED_AMOUNT_PATTERN = /[+-]\d+(\.\d+)?M/;

export async function expectFirstBubbleHasSignedAmount(
  ctx: TestContext,
): Promise<void> {
  const sign = await ctx.po.positionsPanel.firstBubbleSign();
  assertTrue(
    sign === "pos" || sign === "neg",
    `expected first exposure bubble to carry a pos/neg data-sign, got ${String(sign)}`,
  );
  const text = await ctx.po.positionsPanel.firstBubbleText();
  assertTrue(
    SIGNED_AMOUNT_PATTERN.test(text),
    `first exposure bubble text "${text}" did not contain a signed millions amount`,
  );
}

export async function expectFirstRowHasSignedAmount(
  ctx: TestContext,
): Promise<void> {
  const sign = await ctx.po.positionsPanel.firstRowSign();
  assertTrue(
    sign === "pos" || sign === "neg",
    `expected first exposure ladder row to carry a pos/neg data-sign, got ${String(sign)}`,
  );
  const text = await ctx.po.positionsPanel.firstRowText();
  assertTrue(
    SIGNED_AMOUNT_PATTERN.test(text),
    `first exposure ladder row text "${text}" did not contain a signed millions amount`,
  );
}
