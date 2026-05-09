import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

When("the trader clicks buy on the first tile", async function (this: PlaywrightWorld) {
  await this.po.liveRatesTile.clickBuyOnFirst();
});

When("the trader clicks sell on the first tile", async function (this: PlaywrightWorld) {
  await this.po.liveRatesTile.clickSellOnFirst();
});

Then(
  "the trade confirmation appears within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.liveRatesTile.waitForConfirmation(seconds * 1_000);
  },
);

Then(
  /^the trade confirmation matches one of (\/.*\/[gimsuy]?(?:,\s*\/.*\/[gimsuy]?)*)$/,
  async function (this: PlaywrightWorld, raw: string) {
    const patterns = parseRegexList(raw);
    await this.po.liveRatesTile.confirmationContainsAny(patterns, 5_000);
  },
);

Then(
  "the trade confirmation matches one of {} within {int} seconds",
  async function (this: PlaywrightWorld, raw: string, seconds: number) {
    const patterns = parseRegexList(raw);
    await this.po.liveRatesTile.confirmationContainsAny(patterns, seconds * 1_000);
  },
);

When("the trader dismisses the trade confirmation", async function (this: PlaywrightWorld) {
  await this.po.liveRatesTile.dismissConfirmation();
});

Then(
  "the trade confirmation hides within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.liveRatesTile.confirmationHidden(seconds * 1_000);
  },
);

Then("the blotter table is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.blotterTable.isVisible()).toBe(true);
});

Then(
  "the blotter has at least {int} row",
  async function (this: PlaywrightWorld, n: number) {
    expect(await this.po.blotterTable.rowCount()).toBeGreaterThanOrEqual(n);
  },
);

Then("the notional input on the first tile is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.liveRatesTile.isNotionalInputVisible()).toBe(true);
});

When(
  "the trader sets the first tile notional to {string}",
  async function (this: PlaywrightWorld, value: string) {
    await this.po.liveRatesTile.fillFirstTileNotional(value);
  },
);

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
