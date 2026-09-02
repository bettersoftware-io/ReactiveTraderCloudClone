import type { JSX } from "solid-js";

import type { CreditRfqFilter } from "@rtc/domain";

import styles from "./RfqFilterPills.module.css";

/** PROTO L564/L1325: the LIVE/CLOSED/ALL filter pills. Exported for RfqsHead
 * to render in the panel's head slot, writing through the same
 * useCreditRfqFilterPreference seam RfqsPanel reads. */
export function RfqFilterPills(props: RfqFilterPillsProps): JSX.Element {
  function filterRfqs(next: CreditRfqFilter) {
    return () => {
      props.onFilter(next);
    };
  }

  return (
    <div class={styles.filters}>
      <button
        type="button"
        class={styles.pill}
        data-testid="rfq-filter-live"
        data-active={String(props.filter === "live")}
        onClick={filterRfqs("live")}
      >
        LIVE {props.liveCount}
      </button>
      <button
        type="button"
        class={styles.pill}
        data-testid="rfq-filter-closed"
        data-active={String(props.filter === "closed")}
        onClick={filterRfqs("closed")}
      >
        CLOSED
      </button>
      <button
        type="button"
        class={styles.pill}
        data-testid="rfq-filter-all"
        data-active={String(props.filter === "all")}
        onClick={filterRfqs("all")}
      >
        ALL
      </button>
    </div>
  );
}

export interface RfqFilterPillsProps {
  filter: CreditRfqFilter;
  /** Pre-formatted count of Open RFQs, shown next to the LIVE pill (PROTO
   * useCreditRfqs.ts liveCount / L1325): "(N)" when N > 0, "" when zero — so
   * the rendered label reads "LIVE (3)" or bare "LIVE", never "LIVE 0". The
   * caller (RfqsHead) is responsible for the formatting. */
  liveCount: string;
  onFilter: (filter: CreditRfqFilter) => void;
}
