export interface CreditRfqFormPO {
  waitForSendButton(timeoutMs: number): Promise<void>;
  hasDirectionButtons(): Promise<boolean>;
  hasQtyInput(): Promise<boolean>;
  selectInstrument(instrumentId: number): Promise<void>;
  fillQuantity(qty: string): Promise<void>;
  toggleDealer(dealerId: number): Promise<void>;
  clickSend(): Promise<void>;
  /**
   * Waits for the post-submit "RFQ Created" confirmation to appear, then
   * parses and returns the rfqId out of its "... | RFQ ID: <n>" detail text.
   * The dock's New RFQ panel has no create→confirm→redirect any more (the
   * old CreditWorkspace's onCreated tab-switch is inert now that the form is
   * permanently docked) — confirmation is the only signal the create
   * succeeded, and the rfqId is needed to find the resulting card.
   */
  waitForConfirmedRfqId(timeoutMs: number): Promise<number>;
}
