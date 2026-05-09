import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

const recordedCounts = new Map<string, number>();
let firstTileTextSnapshot: string | undefined;

Then(
  "a price tile is visible within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.liveRatesTile.waitForFirstTile(seconds * 1_000);
  },
);

Then(
  "there is at least {int} visible tile",
  async function (this: PlaywrightWorld, n: number) {
    expect(await this.po.liveRatesTile.count()).toBeGreaterThanOrEqual(n);
  },
);

Then(
  "the first tile has visible sell and buy buttons",
  async function (this: PlaywrightWorld) {
    expect(await this.po.liveRatesTile.firstTileSellVisible()).toBe(true);
    expect(await this.po.liveRatesTile.firstTileBuyVisible()).toBe(true);
  },
);

When(
  "the trader records the visible tile count as {string}",
  async function (this: PlaywrightWorld, key: string) {
    recordedCounts.set(key, await this.po.liveRatesTile.count());
  },
);

When(
  "the trader clicks the {string} currency filter",
  async function (this: PlaywrightWorld, category: string) {
    await this.po.liveRatesTile.clickFilter(category);
  },
);

Then(
  "the visible tile count is at most {string}",
  async function (this: PlaywrightWorld, key: string) {
    const baseline = recordedCounts.get(key);
    if (baseline === undefined) throw new Error(`no recorded count for ${key}`);
    expect(await this.po.liveRatesTile.count()).toBeLessThanOrEqual(baseline);
  },
);

Then(
  "the visible tile count equals {string}",
  async function (this: PlaywrightWorld, key: string) {
    const baseline = recordedCounts.get(key);
    if (baseline === undefined) throw new Error(`no recorded count for ${key}`);
    expect(await this.po.liveRatesTile.count()).toBe(baseline);
  },
);

Then("the view toggle button is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.liveRatesTile.viewToggleVisible()).toBe(true);
});

Then(
  "the view toggle button shows {string}",
  async function (this: PlaywrightWorld, expected: string) {
    expect(await this.po.liveRatesTile.viewToggleLabel()).toContain(expected);
  },
);

When("the trader clicks the view toggle", async function (this: PlaywrightWorld) {
  await this.po.liveRatesTile.clickViewToggle();
});

When("the trader records the first tile text", async function (this: PlaywrightWorld) {
  firstTileTextSnapshot = await this.po.liveRatesTile.firstTileText();
});

When("the trader waits {int} seconds", async function (this: PlaywrightWorld, n: number) {
  await this.page.waitForTimeout(n * 1_000);
});

Then("the first tile text is non-empty", async function (this: PlaywrightWorld) {
  const current = await this.po.liveRatesTile.firstTileText();
  expect(firstTileTextSnapshot?.length ?? 0).toBeGreaterThan(0);
  expect(current.length).toBeGreaterThan(0);
});
