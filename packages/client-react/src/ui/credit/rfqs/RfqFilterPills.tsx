import type { ReactElement } from "react";

import type { CreditRfqFilter } from "@rtc/domain";

import styles from "./RfqFilterPills.module.css";

/** PROTO L564/L1325: the LIVE/CLOSED/ALL filter pills. Exported for RfqsHead
 * (Task 4) to render in the panel's head slot, writing through the same
 * useCreditRfqFilterPreference seam RfqsPanel reads. */
export function RfqFilterPills(props: RfqFilterPillsProps): ReactElement {
  const { filter, liveCount, onFilter } = props;

  return (
    <div className={styles.filters}>
      <button
        type="button"
        className={styles.pill}
        data-testid="rfq-filter-live"
        data-active={String(filter === "live")}
        onClick={() => {
          onFilter("live");
        }}
      >
        LIVE {liveCount}
      </button>
      <button
        type="button"
        className={styles.pill}
        data-testid="rfq-filter-closed"
        data-active={String(filter === "closed")}
        onClick={() => {
          onFilter("closed");
        }}
      >
        CLOSED
      </button>
      <button
        type="button"
        className={styles.pill}
        data-testid="rfq-filter-all"
        data-active={String(filter === "all")}
        onClick={() => {
          onFilter("all");
        }}
      >
        ALL
      </button>
    </div>
  );
}

export interface RfqFilterPillsProps {
  filter: CreditRfqFilter;
  /** Count of Open RFQs, shown next to the LIVE pill (PROTO L1325). */
  liveCount: number;
  onFilter: (filter: CreditRfqFilter) => void;
}
