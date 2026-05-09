import type { Page } from "@playwright/test";
import type { CreditRfqFormPO } from "../contracts/CreditRfqForm";

export class PlaywrightCreditRfqForm implements CreditRfqFormPO {
  constructor(private readonly page: Page) {}
  waitForSubmitButton(_t: number): Promise<void> { throw notYet("CreditRfqForm.waitForSubmitButton"); }
  hasBuyAndSellButtons(): Promise<boolean> { throw notYet("CreditRfqForm.hasBuyAndSellButtons"); }
  hasDirectionLabel(): Promise<boolean> { throw notYet("CreditRfqForm.hasDirectionLabel"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
