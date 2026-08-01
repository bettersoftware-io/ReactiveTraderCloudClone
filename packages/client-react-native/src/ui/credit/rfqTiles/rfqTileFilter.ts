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
      return state === RfqState.Open;
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
