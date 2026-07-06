// tests/browser/cypress/creditRfq.spec.ts
import { getCtx } from "./_context";
import { withCreditWorkspaceOpen } from "./_openWorkspace";
import * as creditRfq from "./scenarios/creditRfq";
import * as theme from "./scenarios/theme";

describe("Credit RFQ", () => {
  withCreditWorkspaceOpen();

  it("credit dock shows the New RFQ, RFQs, and Credit Blotter panels together", () => {
    const ctx = getCtx();
    theme.expectCreditDockVisible(ctx);
  });

  it("RFQs panel shows initial state", () => {
    const ctx = getCtx();
    creditRfq.expectNoRfqsMessageWithin(ctx, 5);
  });

  it("New RFQ form has all required fields", () => {
    const ctx = getCtx();
    creditRfq.expectSendButtonWithin(ctx, 3);
    creditRfq.expectHasDirectionButtons(ctx);
    creditRfq.expectHasQtyInput(ctx);
  });

  it("creating a new RFQ shows it live in the RFQs panel with a pending quote", () => {
    const ctx = getCtx();
    creditRfq.createAdaptiveBankOnlyRfq(ctx, 5).then((rfqId) => {
      creditRfq.expectRfqCardWithin(ctx, rfqId, 5);
      creditRfq.expectFirstQuoteStatePending(ctx, rfqId);
    });
  });

  it("filter pills switch between live and closed RFQs", () => {
    const ctx = getCtx();
    creditRfq.clickClosedFilter(ctx);
    creditRfq.expectSeededClosedRfqsVisible(ctx);
  });

  it("credit blotter shows existing trades", () => {
    const ctx = getCtx();
    creditRfq.expectCreditTradesHeadingWithin(ctx, 5);
    creditRfq.expectCreditBlotterRowCountAtLeast(ctx, 2);
  });

  it("live RFQ list shows no open RFQs initially — seeded terminal RFQs live under All", () => {
    const ctx = getCtx();
    creditRfq.expectNoRfqsMessageWithin(ctx, 3);
  });
});
