import { Then, When } from "@cucumber/cucumber";

import * as creditRfq from "../scenarios/creditRfq";
import type { StepContext } from "../testContext";

Then(
  "the credit RFQ list is empty within {int} seconds",
  function expectCreditRfqListEmptyWithin(this: StepContext, seconds: number) {
    return creditRfq.expectNoRfqsMessageWithin(this.ctx, seconds);
  },
);

Then(
  "the credit RFQ send button appears within {int} seconds",
  function expectCreditRfqSendButtonWithin(this: StepContext, seconds: number) {
    return creditRfq.expectSendButtonWithin(this.ctx, seconds);
  },
);

Then(
  "the credit RFQ form has Buy and Sell direction buttons",
  function expectCreditRfqHasDirectionButtons(this: StepContext) {
    return creditRfq.expectHasDirectionButtons(this.ctx);
  },
);

Then(
  "the credit RFQ form has a quantity input",
  function expectCreditRfqHasQtyInput(this: StepContext) {
    return creditRfq.expectHasQtyInput(this.ctx);
  },
);

When(
  "the trader creates a new credit RFQ quoted to Adaptive Bank",
  async function createAdaptiveBankOnlyRfq(this: StepContext) {
    this.ctx.scratch.creditRfq.rfqId =
      await creditRfq.createAdaptiveBankOnlyRfq(this.ctx, 5);
  },
);

Then(
  "the new RFQ card appears within {int} seconds",
  function expectRfqCardWithin(this: StepContext, seconds: number) {
    const rfqId = this.ctx.scratch.creditRfq.rfqId;

    if (rfqId == null) {
      throw new Error("no rfqId recorded on ctx.scratch");
    }

    return creditRfq.expectRfqCardWithin(this.ctx, rfqId, seconds);
  },
);

Then(
  "its first quote is pending",
  function expectFirstQuotePending(this: StepContext) {
    const rfqId = this.ctx.scratch.creditRfq.rfqId;

    if (rfqId == null) {
      throw new Error("no rfqId recorded on ctx.scratch");
    }

    return creditRfq.expectFirstQuoteStatePending(this.ctx, rfqId);
  },
);

When(
  "the trader clicks the credit closed filter",
  function clickClosedFilter(this: StepContext) {
    return creditRfq.clickClosedFilter(this.ctx);
  },
);

Then(
  "the seeded closed RFQs are visible",
  function expectSeededClosedRfqsVisible(this: StepContext) {
    return creditRfq.expectSeededClosedRfqsVisible(this.ctx);
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
  "the credit blotter has at least {int} rows",
  function expectCreditBlotterRowCountAtLeast(
    this: StepContext,
    minCount: number,
  ) {
    return creditRfq.expectCreditBlotterRowCountAtLeast(this.ctx, minCount);
  },
);
