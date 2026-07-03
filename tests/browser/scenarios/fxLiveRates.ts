import type { TestContext } from "../testContext";
import {
  assertEquals,
  assertGreaterThanZero,
  assertGte,
  assertLte,
  assertTrue,
} from "./assert";

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

export async function expectFirstTileHasBuyAndSellButtons(
  ctx: TestContext,
): Promise<void> {
  assertTrue(
    await ctx.po.liveRatesTile.firstTileSellVisible(),
    "first tile sell button not visible",
  );
  assertTrue(
    await ctx.po.liveRatesTile.firstTileBuyVisible(),
    "first tile buy button not visible",
  );
}

export async function recordVisibleTileCount(
  ctx: TestContext,
  key: string,
): Promise<void> {
  ctx.scratch.fxLiveRates.recordedCounts.set(
    key,
    await ctx.po.liveRatesTile.count(),
  );
}

export async function clickCurrencyFilter(
  ctx: TestContext,
  category: string,
): Promise<void> {
  await ctx.po.liveRatesTile.clickFilter(category);
}

export async function expectVisibleTileCountAtMost(
  ctx: TestContext,
  key: string,
): Promise<void> {
  // Read the baseline AFTER awaiting the current count. Under the
  // cucumber-cypress shim the prior record step's `map.set(...)` lands in an
  // awaited continuation the shim discards, so a baseline read at the JS call
  // site can fire before that set ("no recorded count for …"). Awaiting a PO
  // call first drains the cy queue past the record step, guaranteeing the set
  // has landed. No behaviour change for the async (Playwright) drivers.
  const current = await ctx.po.liveRatesTile.count();
  const baseline = ctx.scratch.fxLiveRates.recordedCounts.get(key);
  if (baseline === undefined) throw new Error(`no recorded count for ${key}`);
  assertLte(current, baseline);
}

export async function expectVisibleTileCountEquals(
  ctx: TestContext,
  key: string,
): Promise<void> {
  const current = await ctx.po.liveRatesTile.count();
  const baseline = ctx.scratch.fxLiveRates.recordedCounts.get(key);
  if (baseline === undefined) throw new Error(`no recorded count for ${key}`);
  assertEquals(current, baseline);
}

export async function expectChartsToggleVisible(
  ctx: TestContext,
): Promise<void> {
  assertTrue(
    await ctx.po.liveRatesTile.chartsToggleVisible(),
    "charts toggle not visible",
  );
}

export async function expectChartsToggleActive(
  ctx: TestContext,
  active: boolean,
): Promise<void> {
  assertEquals(await ctx.po.liveRatesTile.chartsToggleActive(), active);
}

export async function clickChartsToggle(ctx: TestContext): Promise<void> {
  await ctx.po.liveRatesTile.clickChartsToggle();
}

export async function expectFirstTileChartVisible(
  ctx: TestContext,
  visible: boolean,
): Promise<void> {
  assertEquals(await ctx.po.liveRatesTile.firstTileChartVisible(), visible);
}

export async function recordFirstTileText(ctx: TestContext): Promise<void> {
  ctx.scratch.fxLiveRates.firstTileTextSnapshot =
    await ctx.po.liveRatesTile.firstTileText();
}

export async function expectFirstTileTextNonEmpty(
  ctx: TestContext,
): Promise<void> {
  const current = await ctx.po.liveRatesTile.firstTileText();
  assertGreaterThanZero(
    ctx.scratch.fxLiveRates.firstTileTextSnapshot?.length ?? 0,
    "snapshot length should be > 0",
  );
  assertGreaterThanZero(
    current.length,
    "current first tile text should be non-empty",
  );
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
  assertTrue(
    pattern.test(text),
    `first tile text "${text}" did not match ${pattern}`,
  );
}
