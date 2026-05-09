import type { Page } from "@playwright/test";
import type { FxRfqFormPO } from "../contracts/FxRfqForm";

export class PlaywrightFxRfqForm implements FxRfqFormPO {
  constructor(private readonly page: Page) {}
  waitForRfqButton(_t: number): Promise<void> { throw notYet("FxRfqForm.waitForRfqButton"); }
  clickInitiateRfq(): Promise<void> { throw notYet("FxRfqForm.clickInitiateRfq"); }
  waitForCountdownOrQuote(_t: number): Promise<void> { throw notYet("FxRfqForm.waitForCountdownOrQuote"); }
}

function notYet(name: string): Error {
  return new Error(`${name} is not yet implemented in 5A.1; landing in a later task`);
}
