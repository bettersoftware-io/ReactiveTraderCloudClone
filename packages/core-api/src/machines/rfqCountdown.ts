/** What seeds a credit-RFQ countdown. An OBJECT, not two positional
 * numbers: `remainingMs` is `creationTimestamp + totalMs − now`, which is
 * symmetric in the two fields, so a swapped pair would produce the
 * identical countdown and no test could witness it (ADR-006, "Decided in
 * slice 3"). Named fields make the swap a type error instead — carried
 * unchanged from the UI's `useRfqCountdown(seed)` through the
 * `MachineFactories` seam to each core's factory, so no site along the
 * way pairs two bare numbers. */
export interface RfqCountdownSeed {
  /** `Rfq.creationTimestamp` — epoch milliseconds. */
  readonly creationTimestamp: number;
  /** The RFQ's full window, in milliseconds. */
  readonly totalMs: number;
}
