import type { TestContext } from "../testContext";
import { assertContains, assertEquals, assertGreaterThanZero, assertLte, assertTrue } from "./assert";

export async function clickFirstBlotterHeader(ctx: TestContext): Promise<void> {
  await ctx.po.blotterTable.clickFirstHeader();
}

export async function recordBlotterRowCount(ctx: TestContext, key: string): Promise<void> {
  ctx.scratch.blotter.recordedRowCounts.set(key, await ctx.po.blotterTable.rowCount());
}

export async function setBlotterQuickFilter(ctx: TestContext, text: string): Promise<void> {
  await ctx.po.blotterTable.fillQuickFilter(text);
}

export async function clearBlotterQuickFilter(ctx: TestContext): Promise<void> {
  await ctx.po.blotterTable.clearQuickFilter();
}

export async function expectBlotterRowCountAtMost(ctx: TestContext, key: string): Promise<void> {
  const baseline = ctx.scratch.blotter.recordedRowCounts.get(key);
  if (baseline === undefined) throw new Error(`no recorded row count for ${key}`);
  assertLte(await ctx.po.blotterTable.rowCount(), baseline);
}

export async function expectBlotterRowCountEquals(ctx: TestContext, key: string): Promise<void> {
  const baseline = ctx.scratch.blotter.recordedRowCounts.get(key);
  if (baseline === undefined) throw new Error(`no recorded row count for ${key}`);
  assertEquals(await ctx.po.blotterTable.rowCount(), baseline);
}

export async function expectExportCsvVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.blotterTable.isExportCsvVisible(), "export CSV button not visible");
}

export async function expectExportCsvTextContains(ctx: TestContext, expected: string): Promise<void> {
  assertContains(await ctx.po.blotterTable.exportCsvText(), expected);
}

export async function expectFirstBlotterRowVisible(ctx: TestContext): Promise<void> {
  assertTrue(await ctx.po.blotterTable.isFirstRowVisible(), "first blotter row not visible");
}

export async function expectFirstBlotterRowBackgroundNonEmpty(ctx: TestContext): Promise<void> {
  const color = await ctx.po.blotterTable.firstRowBackgroundColor();
  assertGreaterThanZero(color.length, "first blotter row background color is empty");
}

export async function hoverFirstBlotterRow(ctx: TestContext): Promise<void> {
  await ctx.po.blotterTable.hoverFirstRow();
}

export async function buyNTimesWithDismissals(ctx: TestContext, n: number): Promise<void> {
  // Buy from the first tile (n-1) times, then buy from GBPJPY to guarantee
  // at least one Rejected trade (ExecutionSimulator always rejects GBPJPY).
  if (n > 1) await ctx.po.liveRatesTile.buyNTimesWithDismissals(n - 1);
  await ctx.po.liveRatesTile.clickBuyOnPair("GBPJPY");
  await new Promise((r) => setTimeout(r, 1_500));
  if (await ctx.po.liveRatesTile.isConfirmationVisible()) {
    await ctx.po.liveRatesTile.dismissConfirmation();
  }
}
