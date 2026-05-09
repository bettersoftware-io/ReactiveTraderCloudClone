import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

When("the harness loads the home page", async function (this: PlaywrightWorld) {
  await this.page.goto("/");
});

Then("the page title is non-empty", async function (this: PlaywrightWorld) {
  await expect(this.page).toHaveTitle(/.+/);
});
