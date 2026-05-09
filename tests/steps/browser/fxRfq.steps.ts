import { Then, When } from "@cucumber/cucumber";
import type { PlaywrightWorld } from "../../support/world";

Then(
  "the RFQ initiation button appears within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.fxRfqForm.waitForRfqButton(seconds * 1_000);
  },
);

When("the trader clicks the RFQ initiation button", async function (this: PlaywrightWorld) {
  await this.po.fxRfqForm.clickInitiateRfq();
});

Then(
  "a countdown or quote indicator appears within {int} seconds",
  async function (this: PlaywrightWorld, seconds: number) {
    await this.po.fxRfqForm.waitForCountdownOrQuote(seconds * 1_000);
  },
);
