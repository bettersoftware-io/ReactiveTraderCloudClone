import { test } from "./_context";
import { withCreditWorkspaceOpen } from "./_openWorkspace";
import * as creditRfq from "../scenarios/creditRfq";
import * as theme from "../scenarios/theme";

test.describe("Credit RFQ", () => {
  withCreditWorkspaceOpen();

  test("credit workspace shows navigation tabs", async ({ ctx }) => {
    await theme.expectCreditNavVisible(ctx);
    await creditRfq.expectCreditTabVisible(ctx, "tiles");
    await creditRfq.expectCreditTabVisible(ctx, "new-rfq");
    await creditRfq.expectCreditTabVisible(ctx, "sell-side");
  });

  test("RFQ tiles panel shows initial state", async ({ ctx }) => {
    await creditRfq.expectCreditTabVisible(ctx, "tiles");
    await creditRfq.expectMessageWithin(ctx, "No RFQs to display", 5);
  });

  test("navigate to New RFQ form", async ({ ctx }) => {
    await creditRfq.clickCreditTab(ctx, "new-rfq");
    await creditRfq.expectCreditRfqSubmitButtonWithin(ctx, 3);
  });

  test("New RFQ form has all required fields", async ({ ctx }) => {
    await creditRfq.clickCreditTab(ctx, "new-rfq");
    await creditRfq.expectCreditRfqSubmitButtonWithin(ctx, 3);
    await creditRfq.expectCreditRfqHasBuySellButtons(ctx);
    await creditRfq.expectCreditRfqHasDirectionLabel(ctx);
  });

  test("navigate to Sell Side panel", async ({ ctx }) => {
    await creditRfq.clickCreditTab(ctx, "sell-side");
    await creditRfq.expectSellSideHeadingWithin(ctx, 5);
  });

  test("credit blotter is visible below the workspace", async ({ ctx }) => {
    await creditRfq.expectCreditTradesHeadingWithin(ctx, 5);
  });

  test("switching between credit views maintains state", async ({ ctx }) => {
    await creditRfq.clickCreditTab(ctx, "new-rfq");
    await creditRfq.expectCreditRfqSubmitButtonWithin(ctx, 3);
    await creditRfq.clickCreditTab(ctx, "tiles");
    await creditRfq.expectMessageWithin(ctx, "No RFQs to display", 3);
    await creditRfq.clickCreditTab(ctx, "sell-side");
    await creditRfq.expectSellSideHeadingWithin(ctx, 3);
  });

  test("credit RFQ list is empty when no RFQs have been created", async ({ ctx }) => {
    await creditRfq.expectMessageWithin(ctx, "No RFQs to display", 3);
  });
});
