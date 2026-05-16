import type { FxRfqFormPO } from "../contracts/FxRfqForm";
import { TESTIDS } from "../contracts/testids";

const TILE_PREFIX_SELECTOR = `[data-testid^="${TESTIDS.liveRates.tilePrefix}"]`;

export class CypressFxRfqForm implements FxRfqFormPO {
  private firstTile() {
    return cy.get(TILE_PREFIX_SELECTOR).first();
  }

  waitForRfqButton(timeoutMs: number): Promise<void> {
    return this.firstTile()
      .scrollIntoView()
      .contains(/initiate rfq|request quote/i, { timeout: timeoutMs })
      .should("be.visible") as unknown as Promise<void>;
  }

  clickInitiateRfq(): Promise<void> {
    return this.firstTile()
      .scrollIntoView()
      .contains(/initiate rfq|request quote/i)
      .click() as unknown as Promise<void>;
  }

  waitForCountdownOrQuote(timeoutMs: number): Promise<void> {
    return this.firstTile()
      .scrollIntoView()
      .contains(/\d+s|accepting|expired|quote/i, { timeout: timeoutMs })
      .should("be.visible") as unknown as Promise<void>;
  }
}
