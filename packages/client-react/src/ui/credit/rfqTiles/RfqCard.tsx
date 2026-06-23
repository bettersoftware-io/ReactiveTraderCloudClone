import type { ReactElement } from "react";

import {
  type Dealer,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";

import { QuoteCard } from "./QuoteCard";

import styles from "./RfqCard.module.css";

interface RfqCardProps {
  rfq: Rfq;
  quotes: readonly Quote[];
  instrument: Instrument | undefined;
  dealers: readonly Dealer[];
  onAccept: (quoteId: number) => void | Promise<void>;
  onDismiss?: (rfqId: number) => void;
}

function stateLabel(state: RfqState): string {
  switch (state) {
    case RfqState.Open:
      return "Live";
    case RfqState.Closed:
      return "Done";
    case RfqState.Expired:
      return "Expired";
    case RfqState.Cancelled:
      return "Cancelled";
  }
}

export function RfqCard({
  rfq,
  quotes,
  instrument,
  dealers,
  onAccept,
  onDismiss,
}: RfqCardProps): ReactElement {
  const dealerMap = new Map<number, Dealer>();

  for (const d of dealers) {
    dealerMap.set(d.id, d);
  }

  const canDismiss = rfq.state !== RfqState.Open;

  function handleDismiss(): void {
    if (onDismiss) onDismiss(rfq.id);
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <div className={styles.instrumentName}>
            {instrument?.name ?? `Instrument #${rfq.instrumentId}`}
          </div>
          <div className={styles.instrumentMeta}>
            {rfq.direction} | Qty: {rfq.quantity.toLocaleString()}
          </div>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.badge} data-state={rfq.state}>
            {stateLabel(rfq.state)}
          </span>
          {!!(canDismiss && onDismiss) && (
            <button
              type="button"
              onClick={handleDismiss}
              className={styles.dismissBtn}
            >
              {"✕"}
            </button>
          )}
        </div>
      </div>

      <div className={styles.quoteList}>
        {quotes.map((quote) => {
          return (
            <QuoteCard
              key={quote.id}
              quote={quote}
              dealer={dealerMap.get(quote.dealerId)}
              onAccept={rfq.state === RfqState.Open ? onAccept : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}
