export interface CreditRfqPanelPO {
  /** All three dock panels (New RFQ, RFQs, Credit Blotter) render at once —
   * there's nothing to navigate to any more, so "the credit screen loaded"
   * is checked by all three heads being simultaneously visible. */
  dockIsVisible(): Promise<boolean>;
  waitForNoRfqsMessage(timeoutMs: number): Promise<void>;
  clickFilterPill(filter: "live" | "closed" | "all"): Promise<void>;
  waitForRfqCard(rfqId: number, timeoutMs: number): Promise<void>;
  rfqCardIsVisible(rfqId: number): Promise<boolean>;
  /** The `data-state` (e.g. "pending", "priced", "accepted", "passed",
   * "rejected") of the first dealer-quote row inside the given RFQ's card —
   * null if the card or a quote row isn't present. Scoped to the card rather
   * than addressed by quoteId directly: quoteIds are server-assigned and
   * unknown to the caller ahead of a create. */
  firstQuoteState(rfqId: number): Promise<string | null>;
  waitForCreditTradesHeading(timeoutMs: number): Promise<void>;
}
