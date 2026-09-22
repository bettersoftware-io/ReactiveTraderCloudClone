/** What seeds a credit-RFQ countdown. An OBJECT, not two positional
 * numbers: `remainingMs` is `creationTimestamp + totalMs − now`, which is
 * symmetric in the two fields, so a swapped pair at any wiring site would
 * produce the identical countdown and no test could witness it (ADR-006,
 * "Decided in slice 3"). Named fields make the swap a type error instead. */
export interface RfqCountdownSeed {
  /** `Rfq.creationTimestamp` — epoch milliseconds. */
  readonly creationTimestamp: number;
  /** The RFQ's full window, in milliseconds. */
  readonly totalMs: number;
}
