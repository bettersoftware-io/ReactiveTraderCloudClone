import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

const recordedRowCounts = new Map<string, number>();

When("the trader clicks the first blotter header", async function (this: PlaywrightWorld) {
  await this.po.blotterTable.clickFirstHeader();
});

When(
  "the trader records the blotter row count as {string}",
  async function (this: PlaywrightWorld, key: string) {
    recordedRowCounts.set(key, await this.po.blotterTable.rowCount());
  },
);

When(
  "the trader sets the blotter quick filter to {string}",
  async function (this: PlaywrightWorld, text: string) {
    await this.po.blotterTable.fillQuickFilter(text);
  },
);

When("the trader clears the blotter quick filter", async function (this: PlaywrightWorld) {
  await this.po.blotterTable.clearQuickFilter();
});

Then(
  "the blotter row count is at most {string}",
  async function (this: PlaywrightWorld, key: string) {
    const baseline = recordedRowCounts.get(key);
    if (baseline === undefined) throw new Error(`no recorded row count for ${key}`);
    expect(await this.po.blotterTable.rowCount()).toBeLessThanOrEqual(baseline);
  },
);

Then(
  "the blotter row count equals {string}",
  async function (this: PlaywrightWorld, key: string) {
    const baseline = recordedRowCounts.get(key);
    if (baseline === undefined) throw new Error(`no recorded row count for ${key}`);
    expect(await this.po.blotterTable.rowCount()).toBe(baseline);
  },
);

Then("the export CSV button is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.blotterTable.isExportCsvVisible()).toBe(true);
});

Then(
  "the export CSV button text contains {string}",
  async function (this: PlaywrightWorld, expected: string) {
    expect(await this.po.blotterTable.exportCsvText()).toContain(expected);
  },
);

Then("the first blotter row is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.blotterTable.isFirstRowVisible()).toBe(true);
});

Then(
  "the first blotter row background color is non-empty",
  async function (this: PlaywrightWorld) {
    const color = await this.po.blotterTable.firstRowBackgroundColor();
    expect(color.length).toBeGreaterThan(0);
  },
);

When("the trader hovers the first blotter row", async function (this: PlaywrightWorld) {
  await this.po.blotterTable.hoverFirstRow();
});

When(
  "the trader buys {int} times with confirmation dismissals",
  { timeout: 30_000 },
  async function (this: PlaywrightWorld, n: number) {
    for (let i = 0; i < n; i++) {
      await this.po.liveRatesTile.clickBuyOnFirst();
      await this.page.waitForTimeout(1_500);
      if (await this.po.liveRatesTile.isConfirmationVisible()) {
        await this.po.liveRatesTile.dismissConfirmation();
        await this.page.waitForTimeout(500);
      }
    }
  },
);
