import type { TestContext } from "../testContext";
import {
  assertContains,
  assertEquals,
  assertGreaterThanZero,
  assertLte,
  assertTrue,
} from "./assert";

export async function clickFirstBlotterHeader(ctx: TestContext): Promise<void> {
  await ctx.po.blotterTable.clickFirstHeader();
}

export async function recordBlotterRowCount(
  ctx: TestContext,
  key: string,
): Promise<void> {
  ctx.scratch.blotter.recordedRowCounts.set(
    key,
    await ctx.po.blotterTable.rowCount(),
  );
}

export async function setBlotterQuickFilter(
  ctx: TestContext,
  text: string,
): Promise<void> {
  await ctx.po.blotterTable.fillQuickFilter(text);
}

export async function clearBlotterQuickFilter(ctx: TestContext): Promise<void> {
  await ctx.po.blotterTable.clearQuickFilter();
}

export async function expectBlotterRowCountAtMost(
  ctx: TestContext,
  key: string,
): Promise<void> {
  // Read the baseline AFTER awaiting the current count — see the matching note
  // in scenarios/fxLiveRates.ts. Prevents a race where the read fires before
  // the prior record step's set lands.
  const current = await ctx.po.blotterTable.rowCount();
  const baseline = ctx.scratch.blotter.recordedRowCounts.get(key);

  if (baseline === undefined) {
    throw new Error(`no recorded row count for ${key}`);
  }

  assertLte(current, baseline);
}

export async function expectBlotterRowCountEquals(
  ctx: TestContext,
  key: string,
): Promise<void> {
  const current = await ctx.po.blotterTable.rowCount();
  const baseline = ctx.scratch.blotter.recordedRowCounts.get(key);

  if (baseline === undefined) {
    throw new Error(`no recorded row count for ${key}`);
  }

  assertEquals(current, baseline);
}

export async function expectExportCsvVisible(ctx: TestContext): Promise<void> {
  assertTrue(
    await ctx.po.blotterTable.isExportCsvVisible(),
    "export CSV button not visible",
  );
}

export async function expectExportCsvTextContains(
  ctx: TestContext,
  expected: string,
): Promise<void> {
  assertContains(await ctx.po.blotterTable.exportCsvText(), expected);
}

/** Click the CSV chip and assert the download's suggested filename. */
export async function expectCsvDownloadSuggestedFilename(
  ctx: TestContext,
  expected: string,
): Promise<void> {
  assertEquals(
    await ctx.po.blotterTable.downloadCsvSuggestedFilename(),
    expected,
  );
}

export async function expectFirstBlotterRowVisible(
  ctx: TestContext,
): Promise<void> {
  assertTrue(
    await ctx.po.blotterTable.isFirstRowVisible(),
    "first blotter row not visible",
  );
}

export async function expectFirstBlotterRowBackgroundNonEmpty(
  ctx: TestContext,
): Promise<void> {
  const color = await ctx.po.blotterTable.firstRowBackgroundColor();
  assertGreaterThanZero(
    color.length,
    "first blotter row background color is empty",
  );
}

export async function hoverFirstBlotterRow(ctx: TestContext): Promise<void> {
  await ctx.po.blotterTable.hoverFirstRow();
}

export async function buyNTimesWithDismissals(
  ctx: TestContext,
  n: number,
): Promise<void> {
  // Buy from the first tile (n-1) times, then buy from GBPJPY to guarantee
  // at least one Rejected trade (ExecutionSimulator always rejects GBPJPY).
  if (n > 1) {
    await ctx.po.liveRatesTile.buyNTimesWithDismissals(n - 1);
  }

  await ctx.po.liveRatesTile.clickBuyOnPair("GBPJPY");
  // Settle-and-dismiss on GBPJPY's OWN tile. This used to sleep 1.5 s and then
  // consult the FIRST tile's confirmation — the wrong tile unless GBPJPY
  // happened to sort first — so the rejection was never actually awaited here
  // and the caller's blotter assertion carried the whole race on its retry
  // budget.
  await ctx.po.liveRatesTile.dismissPairConfirmationOnceSettled(
    "GBPJPY",
    SETTLE_TIMEOUT_MS,
  );
}

// Generous next to the ≤2 s ExecutionSimulator settle; absorbs CPU contention
// when every e2e suite runs at once without costing anything when idle.
const SETTLE_TIMEOUT_MS = 15_000;
