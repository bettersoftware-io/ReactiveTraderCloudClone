import { Then, When } from "@cucumber/cucumber";
import { expect } from "@playwright/test";
import type { PlaywrightWorld } from "../../support/world";

When(
  "the trader switches to the credit {string} tab",
  async function (this: PlaywrightWorld, tab: string) {
    if (tab !== "tiles" && tab !== "new-rfq" && tab !== "sell-side") {
      throw new Error(`unsupported credit tab: ${tab}`);
    }
    await this.po.creditRfqPanel.clickTab(tab);
  },
);

Then(
  "the credit {string} tab is visible",
  async function (this: PlaywrightWorld, tab: string) {
    if (tab !== "tiles" && tab !== "new-rfq" && tab !== "sell-side") {
      throw new Error(`unsupported credit tab: ${tab}`);
    }
    expect(await this.po.creditRfqPanel.tabIsVisible(tab)).toBe(true);
  },
);

Then(
  "the message {string} appears within {int} seconds",
  async function (this: PlaywrightWorld, message: string, seconds: number) {
    if (message === "No RFQs to display") {
      await this.po.creditRfqPanel.waitForNoRfqsMessage(seconds * 1_000);
    } else {
      throw new Error(`message "${message}" has no PO method; add one if needed`);
    }
  },
);

Then(
  "the credit RFQ submit button appears within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.creditRfqForm.waitForSubmitButton(seconds * 1_000);
  },
);

Then(
  "the credit RFQ form has Buy and Sell direction buttons",
  async function (this: PlaywrightWorld) {
    expect(await this.po.creditRfqForm.hasBuyAndSellButtons()).toBe(true);
  },
);

Then("the credit RFQ form has a Direction label", async function (this: PlaywrightWorld) {
  expect(await this.po.creditRfqForm.hasDirectionLabel()).toBe(true);
});

Then(
  "the sell-side heading {string} appears within {int} seconds",
  async function (this: PlaywrightWorld, _heading: string, seconds: number) {
    await this.po.creditRfqPanel.waitForSellSideHeading(seconds * 1_000);
  },
);

Then(
  "the credit trades heading {string} appears within {int} seconds",
  async function (this: PlaywrightWorld, _heading: string, seconds: number) {
    await this.po.creditRfqPanel.waitForCreditTradesHeading(seconds * 1_000);
  },
);
