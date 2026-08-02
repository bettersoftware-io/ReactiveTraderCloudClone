import { type CreditRfqFilter, type Rfq, RfqState } from "@rtc/domain";

/** The buy-side tabs. Three, not five: the mobile prototype offers
 * `LIVE`/`DONE`/`ALL` (dc.html:2121) and the domain's shared preference is the
 * same three-way union, so RN, web and the prototype now agree. The former
 * `Expired`/`Cancelled` tabs fold into `closed` — a settled RFQ is a settled
 * RFQ, and each card still shows why it settled. */
export const RFQ_FILTERS: readonly CreditRfqFilter[] = [
  "live",
  "closed",
  "all",
];

/** The prototype's own labels for those values (dc.html:2121). Mobile says
 * DONE where the web says CLOSED; the stored value is identical. */
export const RFQ_FILTER_LABELS: Readonly<Record<CreditRfqFilter, string>> = {
  live: "LIVE",
  closed: "DONE",
  all: "ALL",
};

function filterMatches(state: RfqState, filter: CreditRfqFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "live":
      // A TRADED rfq stays in LIVE until it is dismissed — the prototype's own
      // rule (dc.html:2127-2129: "freshly-accepted cards linger in LIVE so the
      // ACCEPTED stamp reads before they leave"), and the only way the stamp is
      // ever seen. Encoding the linger as the exit animation's duration cannot
      // work: React drops the card from this list the instant its state turns
      // Closed, so the element Reanimated animates out is the PRE-ACCEPT
      // snapshot — it carries no stamp, and it reads the Open branch of
      // `exitMsFor`. Measured on device: a 200ms fade of a card still showing
      // ACCEPT buttons. Expired and Cancelled are NOT kept; only a trade earns
      // an acknowledgement.
      return state === RfqState.Open || state === RfqState.Closed;
    case "closed":
      return state !== RfqState.Open;
  }
}

/** Filter RFQs by the selected tab, dropping dismissed ids, sorted newest
 * first. Pure — no React/RN — so it stays vitest-parseable. Matches the web
 * `RfqsPanel.matchesFilter` value-for-value. */
export function filterRfqs(
  rfqs: readonly Rfq[],
  filter: CreditRfqFilter,
  dismissed: ReadonlySet<number>,
): readonly Rfq[] {
  return rfqs
    .filter((r) => {
      return filterMatches(r.state, filter) && !dismissed.has(r.id);
    })
    .sort((a, b) => {
      return b.creationTimestamp - a.creationTimestamp;
    });
}
