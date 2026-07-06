import * as creditRfq from "../scenarios/creditRfq";
import * as theme from "../scenarios/theme";
import { test } from "./_context";
import { withCreditWorkspaceOpen } from "./_openWorkspace";

test.describe("Credit RFQ", () => {
  withCreditWorkspaceOpen();

  test("credit dock shows the New RFQ, RFQs, and Credit Blotter panels together", async ({
    ctx,
  }) => {
    await theme.expectCreditDockVisible(ctx);
  });

  test("RFQs panel shows initial state", async ({ ctx }) => {
    await creditRfq.expectNoRfqsMessageWithin(ctx, 5);
  });

  test("New RFQ form has all required fields", async ({ ctx }) => {
    await creditRfq.expectSendButtonWithin(ctx, 3);
    await creditRfq.expectHasDirectionButtons(ctx);
    await creditRfq.expectHasQtyInput(ctx);
  });

  test("creating a new RFQ shows it live in the RFQs panel with a pending quote", async ({
    ctx,
  }) => {
    const rfqId = await creditRfq.createAdaptiveBankOnlyRfq(ctx, 5);
    await creditRfq.expectRfqCardWithin(ctx, rfqId, 5);
    await creditRfq.expectFirstQuoteStatePending(ctx, rfqId);
  });

  test("filter pills switch between live and closed RFQs", async ({ ctx }) => {
    await creditRfq.clickClosedFilter(ctx);
    await creditRfq.expectSeededClosedRfqsVisible(ctx);
  });

  test("credit blotter shows existing trades", async ({ ctx }) => {
    await creditRfq.expectCreditTradesHeadingWithin(ctx, 5);
    await creditRfq.expectCreditBlotterRowCountAtLeast(ctx, 2);
  });

  test("live RFQ list shows no open RFQs initially — seeded terminal RFQs live under All", async ({
    ctx,
  }) => {
    await creditRfq.expectNoRfqsMessageWithin(ctx, 3);
  });
});
