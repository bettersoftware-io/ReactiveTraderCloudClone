import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

let backgroundBeforeToggle: string | undefined;
let backgroundAfterToggle: string | undefined;

When("the trader toggles the theme", async function (this: PlaywrightWorld) {
  backgroundBeforeToggle = await this.po.workspace.rootBackgroundColor();
  await this.po.themeToggle.click();
  backgroundAfterToggle = await this.po.workspace.rootBackgroundColor();
});

Then("the theme toggle button is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.themeToggle.isVisible()).toBe(true);
});

Then(
  "the workspace background color has changed",
  async function (this: PlaywrightWorld) {
    expect(backgroundAfterToggle).not.toBe(backgroundBeforeToggle);
  },
);

Then(
  "the workspace background color matches the toggled theme",
  async function (this: PlaywrightWorld) {
    const currentBg = await this.po.workspace.rootBackgroundColor();
    expect(currentBg).toBe(backgroundAfterToggle);
  },
);

Then(
  "the theme toggle aria-label mentions {string}",
  async function (this: PlaywrightWorld, term: string) {
    const label = await this.po.themeToggle.ariaLabel();
    expect(label).toContain(term);
  },
);

Then("a price tile is visible", async function (this: PlaywrightWorld) {
  await this.po.liveRatesTile.waitForFirstTile(5_000);
});

Then("the credit navigation is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.creditRfqPanel.navIsVisible()).toBe(true);
});
