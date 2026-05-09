export interface CreditRfqPanelPO {
  navIsVisible(): Promise<boolean>;
  tabIsVisible(tab: "tiles" | "new-rfq" | "sell-side"): Promise<boolean>;
  clickTab(tab: "tiles" | "new-rfq" | "sell-side"): Promise<void>;
  waitForNoRfqsMessage(timeoutMs: number): Promise<void>;
  waitForSellSideHeading(timeoutMs: number): Promise<void>;
  waitForCreditTradesHeading(timeoutMs: number): Promise<void>;
}
