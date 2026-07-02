import type { ReactElement } from "react";
import { useRef } from "react";

import { EmptyRfqs } from "#/credit/Rfqs/EmptyRfqs";
import { RfqCard } from "#/credit/Rfqs/RfqCard";
import styles from "#/credit/Rfqs/RfqsPanel.module.css";
import { rfqCardVm } from "#/credit/rfqCardVm";
import type { Rfq } from "#/credit/types";
import type { CreditRfqsApi } from "#/credit/useCreditRfqs";
import { useFlip } from "#/motion/useFlip";
import { usePreferences } from "#/shell/Preferences/usePreferences";

export interface RfqsPanelProps {
  rfqs: CreditRfqsApi;
}

// PROTO L563-582: the RFQs panel — a LIVE/CLOSED/ALL filter-pill head and a
// FLIP-glided grid of RfqCards (or the empty state when the active filter
// matches nothing). The "◳ RFQs" region label lives in the outer dock
// <Panel head> (CreditScreen), mirroring FX's region-label-in-Panel model.
// The useFlip wiring mirrors
// LiveRatesPanel's exactly: a ref over the grid, keyed on the shown ids plus
// the active tab, so a filter switch (or a card entering/leaving) glides the
// survivors instead of jumping.
export function RfqsPanel(props: RfqsPanelProps): ReactElement {
  const { rfqs } = props;
  const { prefs } = usePreferences();
  const gridRef = useRef<HTMLDivElement | null>(null);
  const shownIds = rfqs.shownRfqs
    .map((r) => {
      return r.id;
    })
    .join(",");
  useFlip(gridRef, `${rfqs.creditTab}:${shownIds}`, {
    reduce: prefs.reduceMotion,
  });

  function handleTab(tab: CreditRfqsApi["creditTab"]): void {
    rfqs.onTab(tab);
  }

  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <div className={styles.filters}>
          <button
            type="button"
            className={styles.pill}
            data-active={String(rfqs.creditTab === "live")}
            onClick={() => {
              handleTab("live");
            }}
          >
            LIVE {rfqs.liveCount}
          </button>
          <button
            type="button"
            className={styles.pill}
            data-active={String(rfqs.creditTab === "closed")}
            onClick={() => {
              handleTab("closed");
            }}
          >
            CLOSED
          </button>
          <button
            type="button"
            className={styles.pill}
            data-active={String(rfqs.creditTab === "all")}
            onClick={() => {
              handleTab("all");
            }}
          >
            ALL
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {rfqs.noRfqs ? (
          <EmptyRfqs />
        ) : (
          <div className={styles.grid} ref={gridRef}>
            {rfqs.shownRfqs.map((rfq) => {
              return <RfqCardCell key={rfq.id} rfq={rfq} rfqs={rfqs} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface RfqCardCellProps {
  rfq: Rfq;
  rfqs: CreditRfqsApi;
}

function RfqCardCell(props: RfqCardCellProps): ReactElement {
  const { rfq, rfqs } = props;
  const vm = rfqCardVm(rfq, rfqs.now);

  function handleAccept(dealerId: number): void {
    rfqs.acceptQuote(rfq.id, dealerId);
  }

  function handleCancel(): void {
    rfqs.cancelRfq(rfq.id);
  }

  function handleRemove(): void {
    rfqs.removeRfq(rfq.id);
  }

  return (
    <div data-flip-key={rfq.id} data-rfq-id={rfq.id} className={styles.cell}>
      <RfqCard
        vm={vm}
        isNew={rfq.id === rfqs.newRfqId}
        isExiting={rfqs.exitingRfqs.includes(rfq.id)}
        onAccept={handleAccept}
        onCancel={handleCancel}
        onRemove={handleRemove}
      />
    </div>
  );
}
