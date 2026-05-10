import type { TestContext } from "../support/testContext";
import { assertGte, assertTrue } from "./assert";

function parseRegexList(raw: string): RegExp[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .map((literal) => {
      const m = literal.match(/^\/(.+)\/([gimsuy]*)$/);
      if (!m) throw new Error(`bad regex literal: ${literal}`);
      return new RegExp(m[1], m[2]);
    });
}

export async function clickBuyOnFirstTile(ctx: TestContext): Promise<void> {
  await ctx.po.liveRatesTile.clickBuyOnFirst();
}

export async function clickSellOnFirstTile(ctx: TestContext): Promise<void> {
  await ctx.po.liveRatesTile.clickSellOnFirst();
}

export async function expectTradeConfirmationWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.liveRatesTile.waitForConfirmation(seconds * 1_000);
}

export async function expectTradeConfirmationMatchesOneOf(
  ctx: TestContext,
  raw: string,
  timeoutMs = 5_000,
): Promise<void> {
  const patterns = parseRegexList(raw);
  await ctx.po.liveRatesTile.confirmationContainsAny(patterns, timeoutMs);
}

export async function dismissTradeConfirmation(ctx: TestContext): Promise<void> {
  await ctx.po.liveRatesTile.dismissConfirmation();
}

export async function expectTradeConfirmationHidesWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.liveRatesTile.confirmationHidden(seconds * 1_000);
}

export async function expectBlotterVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.blotterTable.isVisible(), "blotter table not visible");
}

export async function expectBlotterHasAtLeastNRows(ctx: TestContext, n: number): Promise<void> {
  assertGte(await ctx.po.blotterTable.rowCount(), n);
}

export async function expectFirstTileNotionalInputVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.liveRatesTile.isNotionalInputVisible(), "first-tile notional input not visible");
}

export async function setFirstTileNotional(ctx: TestContext, value: string): Promise<void> {
  await ctx.po.liveRatesTile.fillFirstTileNotional(value);
}
