import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

When("the browser goes offline", async function (this: PlaywrightWorld) {
  await this.po.workspace.setOffline(true);
});

When("the browser comes back online", async function (this: PlaywrightWorld) {
  await this.po.workspace.setOffline(false);
});

Then("the connection status footer is visible", async function (this: PlaywrightWorld) {
  expect(await this.po.footer.isStatusVisible()).toBe(true);
});

Then(
  "the connection status footer shows {string}",
  async function (this: PlaywrightWorld, expected: string) {
    await expect.poll(async () => await this.po.footer.connectionLabel(), { timeout: 5_000 }).toContain(expected);
  },
);

Then("the connection overlay is hidden", async function (this: PlaywrightWorld) {
  expect(await this.po.connectionOverlay.isHidden()).toBe(true);
});

Then(
  "the connection overlay becomes visible within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.connectionOverlay.waitVisible(seconds * 1_000);
  },
);

Then(
  "the connection overlay is hidden within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.connectionOverlay.waitHidden(seconds * 1_000);
  },
);

Then(
  "the connection overlay text matches {}",
  async function (this: PlaywrightWorld, raw: string) {
    const match = raw.match(/^\/(.+)\/([gimsuy]*)$/);
    if (!match) throw new Error(`bad regex literal: ${raw}`);
    const re = new RegExp(match[1], match[2]);
    const text = await this.po.connectionOverlay.text();
    expect(text).toMatch(re);
  },
);
