import type { CreditRfqPanelPO } from "../contracts/CreditRfqPanel";

function notYet(name: string): never {
  throw new Error(`CypressCreditRfqPanel.${name}() not yet implemented (Phase 5A.2 task >10)`);
}

export class CypressCreditRfqPanel implements CreditRfqPanelPO {
  navIsVisible(): Promise<boolean> { notYet("navIsVisible"); }
  tabIsVisible(tab: "tiles" | "new-rfq" | "sell-side"): Promise<boolean> { notYet("tabIsVisible"); }
  clickTab(tab: "tiles" | "new-rfq" | "sell-side"): Promise<void> { notYet("clickTab"); }
  waitForNoRfqsMessage(timeoutMs: number): Promise<void> { notYet("waitForNoRfqsMessage"); }
  waitForSellSideHeading(timeoutMs: number): Promise<void> { notYet("waitForSellSideHeading"); }
  waitForCreditTradesHeading(timeoutMs: number): Promise<void> { notYet("waitForCreditTradesHeading"); }
}
