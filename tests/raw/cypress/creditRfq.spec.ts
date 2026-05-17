// tests/raw/cypress/creditRfq.spec.ts
import { getCtx } from "./_context";
import { withCreditWorkspaceOpen } from "./_openWorkspace";
import * as creditRfq from "../../scenarios/cypress/creditRfq";
import * as theme from "../../scenarios/cypress/theme";

describe("Credit RFQ", () => {
  withCreditWorkspaceOpen();

  it("credit workspace shows navigation tabs", () => {
    const ctx = getCtx();
    theme.expectCreditNavVisible(ctx);
    creditRfq.expectCreditTabVisible(ctx, "tiles");
    creditRfq.expectCreditTabVisible(ctx, "new-rfq");
    creditRfq.expectCreditTabVisible(ctx, "sell-side");
  });

  it("RFQ tiles panel shows initial state", () => {
    const ctx = getCtx();
    creditRfq.expectCreditTabVisible(ctx, "tiles");
    creditRfq.expectMessageWithin(ctx, "No RFQs to display", 5);
  });

  it("navigate to New RFQ form", () => {
    const ctx = getCtx();
    creditRfq.clickCreditTab(ctx, "new-rfq");
    creditRfq.expectCreditRfqSubmitButtonWithin(ctx, 3);
  });

  it("New RFQ form has all required fields", () => {
    const ctx = getCtx();
    creditRfq.clickCreditTab(ctx, "new-rfq");
    creditRfq.expectCreditRfqSubmitButtonWithin(ctx, 3);
    creditRfq.expectCreditRfqHasBuySellButtons(ctx);
    creditRfq.expectCreditRfqHasDirectionLabel(ctx);
  });

  it("navigate to Sell Side panel", () => {
    const ctx = getCtx();
    creditRfq.clickCreditTab(ctx, "sell-side");
    creditRfq.expectSellSideHeadingWithin(ctx, 5);
  });

  it("credit blotter is visible below the workspace", () => {
    const ctx = getCtx();
    creditRfq.expectCreditTradesHeadingWithin(ctx, 5);
  });

  it("switching between credit views maintains state", () => {
    const ctx = getCtx();
    creditRfq.clickCreditTab(ctx, "new-rfq");
    creditRfq.expectCreditRfqSubmitButtonWithin(ctx, 3);
    creditRfq.clickCreditTab(ctx, "tiles");
    creditRfq.expectMessageWithin(ctx, "No RFQs to display", 3);
    creditRfq.clickCreditTab(ctx, "sell-side");
    creditRfq.expectSellSideHeadingWithin(ctx, 3);
  });

  it("credit RFQ list is empty when no RFQs have been created", () => {
    const ctx = getCtx();
    creditRfq.expectMessageWithin(ctx, "No RFQs to display", 3);
  });
});
