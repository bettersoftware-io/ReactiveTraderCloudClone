export interface FxRfqFormPO {
  /** Wait for the "Initiate RFQ" / "Request Quote" button on the first tile. */
  waitForRfqButton(timeoutMs: number): Promise<void>;
  clickInitiateRfq(): Promise<void>;
  /** Wait for a countdown / quote-state indicator to appear. */
  waitForCountdownOrQuote(timeoutMs: number): Promise<void>;
}
