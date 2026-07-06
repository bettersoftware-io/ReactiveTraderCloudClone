import type { ReactElement } from "react";
import { useState } from "react";

import {
  type CreditRfqFilter,
  type Dealer,
  type Instrument,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { useFlipGrid } from "#/ui/shell/motion/useFlipGrid";

import { EmptyRfqs } from "./EmptyRfqs";
import { RfqCard } from "./RfqCard";
import { rfqCardVm } from "./rfqCardVm";

import styles from "./RfqsPanel.module.css";

/** PROTO Rfqs/RfqsPanel.tsx: the RFQs panel — a FLIP-glided grid of RfqCards
 * (or the empty state when the active filter matches nothing). The active
 * filter (LIVE/CLOSED/ALL) lives behind the shared useCreditRfqFilterPreference
 * seam — this panel only READS it; RfqsHead's filter pills (Task 4) write it,
 * the same head/body split LiveRatesHead/LiveRatesPanel use for viewMode. */
export function RfqsPanel(): ReactElement {
  const { useRfqs, useInstruments, useDealers, useCreditRfqFilterPreference } =
    useViewModel();
  const rfqs = useRfqs();
  const instruments = useInstruments();
  const dealers = useDealers();
  const { filter } = useCreditRfqFilterPreference();
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());

  const shown = rfqs
    .filter((r) => {
      return matchesFilter(r.state, filter) && !dismissed.has(r.id);
    })
    .sort((a, b) => {
      return b.creationTimestamp - a.creationTimestamp;
    });

  const shownIds = shown
    .map((r) => {
      return r.id;
    })
    .join(",");
  const { register } = useFlipGrid([filter, shownIds]);

  function handleRemove(rfqId: number): void {
    setDismissed((prev) => {
      return new Set(prev).add(rfqId);
    });
  }

  return (
    <div className={styles.panel}>
      <div className={styles.body}>
        {shown.length === 0 ? (
          <EmptyRfqs />
        ) : (
          <div className={styles.grid}>
            {shown.map((rfq) => {
              return (
                <div
                  key={rfq.id}
                  ref={register(String(rfq.id))}
                  className={styles.cell}
                >
                  <RfqCardCell
                    rfq={rfq}
                    instruments={instruments}
                    dealers={dealers}
                    onRemove={handleRemove}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function matchesFilter(state: RfqState, filter: CreditRfqFilter): boolean {
  switch (filter) {
    case "live":
      return state === RfqState.Open;
    case "closed":
      return state !== RfqState.Open;
    case "all":
      return true;
  }
}

interface RfqCardCellProps {
  rfq: Rfq;
  instruments: readonly Instrument[];
  dealers: readonly Dealer[];
  onRemove: (rfqId: number) => void;
}

function RfqCardCell(props: RfqCardCellProps): ReactElement {
  const { rfq, instruments, dealers, onRemove } = props;
  const { useQuotesForRfq, useAcceptQuote, useCancelRfq } = useViewModel();
  const quotes = useQuotesForRfq(rfq.id);
  const acceptQuote = useAcceptQuote();
  const cancelRfq = useCancelRfq();
  const vm = rfqCardVm(rfq, quotes, instruments, dealers);

  function handleAccept(quoteId: number): void {
    void acceptQuote(quoteId);
  }

  function handleCancel(): void {
    void cancelRfq(rfq.id);
  }

  function handleRemove(): void {
    onRemove(rfq.id);
  }

  return (
    <RfqCard
      vm={vm}
      creationTimestamp={rfq.creationTimestamp}
      expirySecs={rfq.expirySecs}
      onAccept={handleAccept}
      onCancel={handleCancel}
      onRemove={handleRemove}
    />
  );
}
