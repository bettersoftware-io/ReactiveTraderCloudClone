import type { TestContext } from "../testContext";
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

export async function dismissTradeConfirmation(
  ctx: TestContext,
): Promise<void> {
  await ctx.po.liveRatesTile.dismissConfirmation();
}

export async function expectTradeConfirmationHidesWithin(
  ctx: TestContext,
  seconds: number,
): Promise<void> {
  await ctx.po.liveRatesTile.confirmationHidden(seconds * 1_000);
}

export async function expectBlotterVisible(ctx: TestContext): Promise<void> {
  assertTrue(
    await ctx.po.blotterTable.isVisible(),
    "blotter table not visible",
  );
}

export async function expectBlotterHasAtLeastNRows(
  ctx: TestContext,
  n: number,
): Promise<void> {
  assertGte(await ctx.po.blotterTable.rowCount(), n);
}

export async function expectFirstTileNotionalInputVisible(
  ctx: TestContext,
): Promise<void> {
  assertTrue(
    await ctx.po.liveRatesTile.isNotionalInputVisible(),
    "first-tile notional input not visible",
  );
}

export async function setFirstTileNotional(
  ctx: TestContext,
  value: string,
): Promise<void> {
  await ctx.po.liveRatesTile.fillFirstTileNotional(value);
}

export async function setNotionalAndBuy(
  ctx: TestContext,
  value: string,
): Promise<void> {
  await ctx.po.liveRatesTile.fillFirstTileNotional(value);
  await ctx.po.liveRatesTile.clickBuyOnFirst();
}

export async function expectBlotterContainsText(
  ctx: TestContext,
  text: string,
): Promise<void> {
  // The blotter renders a numeric notional locale-formatted (e.g. "1000000" →
  // "1,000,000"), so assert on the formatted form (non-numeric text passes
  // through unchanged). expectContainsText retries until the trade settles into
  // the blotter — no fixed sleep. Under Cypress the retry runs in the command
  // queue (a synthetic delay + JS-side assert would leak as an unhandled
  // rejection onto a later scenario).
  const expected = Number.isFinite(Number(text))
    ? Number(text).toLocaleString("en-US", { maximumFractionDigits: 0 })
    : text;
  await ctx.po.blotterTable.expectContainsText(expected, 10_000);
}

export async function clickBuyOnGbpjpy(ctx: TestContext): Promise<void> {
  // GBPJPY is always rejected by the ExecutionSimulator — use it to get a
  // deterministic "Rejected" result without relying on random probability.
  await ctx.po.liveRatesTile.clickBuyOnPair("GBPJPY");
}

export async function expectAtLeastOneRejectionInBlotter(
  ctx: TestContext,
): Promise<void> {
  // After a GBPJPY buy, verify the blotter shows at least one Rejected trade.
  // Retries until it settles in (no fixed sleep).
  await ctx.po.blotterTable.expectContainsText("Rejected", 10_000);
}
