import { type Rfq, RfqState } from "@rtc/domain";

/** Buy-side filter tabs. Ported from the web `RfqFilterTabs` FILTERS. */
export type RfqFilter = "Live" | "All" | "Done" | "Expired" | "Cancelled";

export const RFQ_FILTERS: readonly RfqFilter[] = [
  "Live",
  "All",
  "Done",
  "Expired",
  "Cancelled",
];

function filterMatches(state: RfqState, filter: RfqFilter): boolean {
  switch (filter) {
    case "All":
      return true;
    case "Live":
      return state === RfqState.Open;
    case "Done":
      return state === RfqState.Closed;
    case "Expired":
      return state === RfqState.Expired;
    case "Cancelled":
      return state === RfqState.Cancelled;
  }
}

/** Filter RFQs by the selected tab, dropping dismissed ids, sorted newest
 * first. Pure — no React/RN — so it stays vitest-parseable. Ported verbatim
 * from the web `RfqTilesPanel` inline filter + sort. */
export function filterRfqs(
  rfqs: readonly Rfq[],
  filter: RfqFilter,
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
