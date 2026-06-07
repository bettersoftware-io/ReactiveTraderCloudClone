// tests/browser/cypress/scenarios/blotter.ts
// Cypress fork of tests/browser/scenarios/blotter.ts — synchronous bodies, queue-aware.
// See Phase 5A.4 spec §3.3.
import type { TestContext } from "../../testContext";
import { assertContains, assertEquals, assertGreaterThanZero, assertLte, assertTrue } from "../../scenarios/assert";
import { chainable } from "./_chainable";

export function clickFirstBlotterHeader(ctx: TestContext): void {
  void ctx.po.blotterTable.clickFirstHeader();
}

export function recordBlotterRowCount(ctx: TestContext, key: string): void {
  chainable(ctx.po.blotterTable.rowCount())
    .then((n) => { ctx.scratch.blotter.recordedRowCounts.set(key, n); });
}

export function setBlotterQuickFilter(ctx: TestContext, text: string): void {
  void ctx.po.blotterTable.fillQuickFilter(text);
}

export function clearBlotterQuickFilter(ctx: TestContext): void {
  void ctx.po.blotterTable.clearQuickFilter();
}

export function expectBlotterRowCountAtMost(ctx: TestContext, key: string): void {
  // Read the scratchpad baseline INSIDE the chainable's .then callback so the
  // read happens after the prior recordBlotterRowCount has drained the cy
  // queue. A bare ctx.scratch read at the JS call site would fire before any
  // queued PO call resolves and miss the baseline. See Phase 5A.4 spec §3.3.
  chainable(ctx.po.blotterTable.rowCount())
    .then((count) => {
      const baseline = ctx.scratch.blotter.recordedRowCounts.get(key);
      if (baseline === undefined) throw new Error(`no recorded row count for ${key}`);
      assertLte(count, baseline);
    });
}

export function expectBlotterRowCountEquals(ctx: TestContext, key: string): void {
  chainable(ctx.po.blotterTable.rowCount())
    .then((count) => {
      const baseline = ctx.scratch.blotter.recordedRowCounts.get(key);
      if (baseline === undefined) throw new Error(`no recorded row count for ${key}`);
      assertEquals(count, baseline);
    });
}

export function expectExportCsvVisible(ctx: TestContext): void {
  chainable(ctx.po.blotterTable.isExportCsvVisible())
    .then((v) => assertTrue(v, "export CSV button not visible"));
}

export function expectExportCsvTextContains(ctx: TestContext, expected: string): void {
  chainable(ctx.po.blotterTable.exportCsvText())
    .then((text) => assertContains(text, expected));
}

export function expectFirstBlotterRowVisible(ctx: TestContext): void {
  chainable(ctx.po.blotterTable.isFirstRowVisible())
    .then((v) => assertTrue(v, "first blotter row not visible"));
}

export function expectFirstBlotterRowBackgroundNonEmpty(ctx: TestContext): void {
  chainable(ctx.po.blotterTable.firstRowBackgroundColor())
    .then((color) => assertGreaterThanZero(color.length, "first blotter row background color is empty"));
}

export function hoverFirstBlotterRow(ctx: TestContext): void {
  void ctx.po.blotterTable.hoverFirstRow();
}

export function buyNTimesWithDismissals(ctx: TestContext, n: number): void {
  // Buy from the first tile (n-1) times, then buy from GBPJPY to guarantee
  // at least one Rejected trade (ExecutionSimulator always rejects GBPJPY).
  if (n > 1) void ctx.po.liveRatesTile.buyNTimesWithDismissals(n - 1);
  void ctx.po.liveRatesTile.clickBuyOnPair("GBPJPY");
  cy.wait(1_500);
  chainable(ctx.po.liveRatesTile.isConfirmationVisible())
    .then((visible) => {
      if (visible) void ctx.po.liveRatesTile.dismissConfirmation();
    });
}
