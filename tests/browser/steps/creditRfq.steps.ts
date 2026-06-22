import { Then, When } from "@cucumber/cucumber";

import * as creditRfq from "../scenarios/creditRfq";
import type { StepContext } from "../testContext";

When(
  "the trader switches to the credit {string} tab",
  function clickCreditTab(this: StepContext, tab: string) {
    return creditRfq.clickCreditTab(this.ctx, tab);
  },
);

Then(
  "the credit {string} tab is visible",
  function expectCreditTabVisible(this: StepContext, tab: string) {
    return creditRfq.expectCreditTabVisible(this.ctx, tab);
  },
);

Then(
  "the message {string} appears within {int} seconds",
  function expectMessageWithin(
    this: StepContext,
    message: string,
    seconds: number,
  ) {
    return creditRfq.expectMessageWithin(this.ctx, message, seconds);
  },
);

Then(
  "the credit RFQ submit button appears within {int} seconds",
  function expectCreditRfqSubmitButtonWithin(
    this: StepContext,
    seconds: number,
  ) {
    return creditRfq.expectCreditRfqSubmitButtonWithin(this.ctx, seconds);
  },
);

Then(
  "the credit RFQ form has Buy and Sell direction buttons",
  function expectCreditRfqHasBuySellButtons(this: StepContext) {
    return creditRfq.expectCreditRfqHasBuySellButtons(this.ctx);
  },
);

Then(
  "the credit RFQ form has a Direction label",
  function expectCreditRfqHasDirectionLabel(this: StepContext) {
    return creditRfq.expectCreditRfqHasDirectionLabel(this.ctx);
  },
);

Then(
  "the sell-side heading {string} appears within {int} seconds",
  function expectSellSideHeadingWithin(
    this: StepContext,
    _heading: string,
    seconds: number,
  ) {
    return creditRfq.expectSellSideHeadingWithin(this.ctx, seconds);
  },
);

Then(
  "the credit trades heading {string} appears within {int} seconds",
  function expectCreditTradesHeadingWithin(
    this: StepContext,
    _heading: string,
    seconds: number,
  ) {
    return creditRfq.expectCreditTradesHeadingWithin(this.ctx, seconds);
  },
);

Then(
  "the credit RFQ list is empty within {int} seconds",
  function expectCreditRfqListEmptyWithin(this: StepContext, seconds: number) {
    return creditRfq.expectMessageWithin(
      this.ctx,
      "No RFQs to display",
      seconds,
    );
  },
);
