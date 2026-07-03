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

// PROTO L563-582: the RFQs panel — a FLIP-glided grid of RfqCards (or the
// empty state when the active filter matches nothing). The "◳ RFQs" region
// label AND the LIVE/CLOSED/ALL filter pills (RfqFilterPills, below) both
// live in the outer dock <Panel head/headControls> (CreditScreen) — P6:
// Panel owns the single 38px head bar, so this component no longer draws
// its own bar underneath it. The useFlip wiring mirrors LiveRatesPanel's
// exactly: a ref over the grid, keyed on the shown ids plus the active tab,
// so a filter switch (or a card entering/leaving) glides the survivors
// instead of jumping.
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

  return (
    <div className={styles.panel}>
      <div className={styles.body}>
        {rfqs.noRfqs ? (
          <EmptyRfqs />
        ) : (
          <div className={styles.grid} ref={gridRef}>
            {rfqs.shownRfqs.map((rfq, ci) => {
              return (
                <RfqCardCell key={rfq.id} rfq={rfq} rfqs={rfqs} index={ci} />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export interface RfqFilterPillsProps {
  creditTab: CreditRfqsApi["creditTab"];
  liveCount: CreditRfqsApi["liveCount"];
  onTab: CreditRfqsApi["onTab"];
}

// PROTO L564/L1325: the LIVE/CLOSED/ALL filter pills. P6: rendered as the
// RFQs Panel's `headControls` (CreditScreen) — not a second bar under the
// Panel head.
export function RfqFilterPills(props: RfqFilterPillsProps): ReactElement {
  const { creditTab, liveCount, onTab } = props;

  return (
    <div className={styles.filters}>
      <button
        type="button"
        className={styles.pill}
        data-active={String(creditTab === "live")}
        onClick={() => {
          onTab("live");
        }}
      >
        LIVE {liveCount}
      </button>
      <button
        type="button"
        className={styles.pill}
        data-active={String(creditTab === "closed")}
        onClick={() => {
          onTab("closed");
        }}
      >
        CLOSED
      </button>
      <button
        type="button"
        className={styles.pill}
        data-active={String(creditTab === "all")}
        onClick={() => {
          onTab("all");
        }}
      >
        ALL
      </button>
    </div>
  );
}

interface RfqCardCellProps {
  rfq: Rfq;
  rfqs: CreditRfqsApi;
  index: number;
}

function RfqCardCell(props: RfqCardCellProps): ReactElement {
  const { rfq, rfqs, index } = props;
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
        isExiting={rfqs.cardExitIds.includes(rfq.id)}
        isTabRecent={rfqs.tabRecent}
        index={index}
        onAccept={handleAccept}
        onCancel={handleCancel}
        onRemove={handleRemove}
      />
    </div>
  );
}
