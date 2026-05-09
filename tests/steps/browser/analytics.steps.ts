import { Then } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

Then(
  "the analytics panel is visible within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.analyticsDashboard.waitVisible(seconds * 1_000);
  },
);

Then(
  "the analytics panel shows the section {string}",
  async function (this: PlaywrightWorld, name: string) {
    expect(await this.po.analyticsDashboard.hasSection(name)).toBe(true);
  },
);
