import type { TestContext } from "../support/testContext";
import { assertContains, assertEquals, assertGte, assertLte, assertTrue, assertGreaterThanZero } from "./assert";

export async function expectFirstPriceTileVisibleWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.liveRatesTile.waitForFirstTile(seconds * 1_000);
}

export async function expectAtLeastNTilesVisible(
  ctx: TestContext,
  n: number,
): Promise<void> {
  assertGte(await ctx.po.liveRatesTile.count(), n);
}

export async function expectFirstTileHasBuyAndSellButtons(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.liveRatesTile.firstTileSellVisible(), "first tile sell button not visible");
  assertTrue(await ctx.po.liveRatesTile.firstTileBuyVisible(), "first tile buy button not visible");
}

export async function recordVisibleTileCount(ctx: TestContext, key: string): Promise<void> {
  ctx.scratch.fxLiveRates.recordedCounts.set(key, await ctx.po.liveRatesTile.count());
}

export async function clickCurrencyFilter(ctx: TestContext, category: string): Promise<void> {
  await ctx.po.liveRatesTile.clickFilter(category);
}

export async function expectVisibleTileCountAtMost(
  ctx: TestContext,
  key: string,
): Promise<void> {
  const baseline = ctx.scratch.fxLiveRates.recordedCounts.get(key);
  if (baseline === undefined) throw new Error(`no recorded count for ${key}`);
  assertLte(await ctx.po.liveRatesTile.count(), baseline);
}

export async function expectVisibleTileCountEquals(
  ctx: TestContext,
  key: string,
): Promise<void> {
  const baseline = ctx.scratch.fxLiveRates.recordedCounts.get(key);
  if (baseline === undefined) throw new Error(`no recorded count for ${key}`);
  assertEquals(await ctx.po.liveRatesTile.count(), baseline);
}

export async function expectViewToggleVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.liveRatesTile.viewToggleVisible(), "view toggle not visible");
}

export async function expectViewToggleShows(ctx: TestContext, expected: string): Promise<void> {
  assertContains(await ctx.po.liveRatesTile.viewToggleLabel(), expected);
}

export async function clickViewToggle(ctx: TestContext): Promise<void> {
  await ctx.po.liveRatesTile.clickViewToggle();
}

export async function recordFirstTileText(ctx: TestContext): Promise<void> {
  ctx.scratch.fxLiveRates.firstTileTextSnapshot = await ctx.po.liveRatesTile.firstTileText();
}

export async function waitSeconds(ctx: TestContext, seconds: number): Promise<void> {
  await ctx.po.workspace.wait(seconds * 1_000);
}

export async function expectFirstTileTextNonEmpty(ctx: TestContext): Promise<void> {
  const current = await ctx.po.liveRatesTile.firstTileText();
  assertGreaterThanZero(ctx.scratch.fxLiveRates.firstTileTextSnapshot?.length ?? 0,
    "snapshot length should be > 0");
  assertGreaterThanZero(current.length, "current first tile text should be non-empty");
}

export async function expectAtLeastNTilesVisibleWithin(
  ctx: TestContext,
  n: number,
  seconds: number,
): Promise<void> {
  await ctx.po.liveRatesTile.waitForFirstTile(seconds * 1_000);
  assertGte(await ctx.po.liveRatesTile.count(), n);
}

export async function expectFirstTileTextMatches(
  ctx: TestContext,
  pattern: RegExp,
): Promise<void> {
  const text = await ctx.po.liveRatesTile.firstTileText();
  assertTrue(pattern.test(text), `first tile text "${text}" did not match ${pattern}`);
}
