import type { Page } from "@playwright/test";
import type { CreditRfqPanelPO } from "../contracts/CreditRfqPanel";
import { TESTIDS } from "../contracts/testids";

export class PlaywrightCreditRfqPanel implements CreditRfqPanelPO {
  constructor(private readonly page: Page) {}
  async navIsVisible(): Promise<boolean> {
    return await this.page.getByTestId(TESTIDS.credit.nav).isVisible();
  }
  tabIsVisible(_t: "tiles" | "new-rfq" | "sell-side"): Promise<boolean> { throw notYet("CreditRfqPanel.tabIsVisible"); }
  clickTab(_t: "tiles" | "new-rfq" | "sell-side"): Promise<void> { throw notYet("CreditRfqPanel.clickTab"); }
  waitForNoRfqsMessage(_t: number): Promise<void> { throw notYet("CreditRfqPanel.waitForNoRfqsMessage"); }
  waitForSellSideHeading(_t: number): Promise<void> { throw notYet("CreditRfqPanel.waitForSellSideHeading"); }
  waitForCreditTradesHeading(_t: number): Promise<void> { throw notYet("CreditRfqPanel.waitForCreditTradesHeading"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
