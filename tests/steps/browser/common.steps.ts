import { Given, When } from "@cucumber/cucumber";
import type { PlaywrightWorld } from "../../support/world";

Given("the trader has the workspace open", async function (this: PlaywrightWorld) {
  await this.po.workspace.open();
});

Given("the trader has the FX workspace open", async function (this: PlaywrightWorld) {
  await this.po.workspace.openFx();
});

Given("the credit workspace is open", async function (this: PlaywrightWorld) {
  await this.po.workspace.openCredit();
});

When(
  "the trader switches to the {string} tab",
  async function (this: PlaywrightWorld, tab: string) {
    if (tab !== "fx" && tab !== "credit" && tab !== "admin") {
      throw new Error(`unsupported tab: ${tab}`);
    }
    await this.po.workspace.clickTab(tab);
  },
);

When("the trader reloads the page", async function (this: PlaywrightWorld) {
  await this.po.workspace.reload();
});
