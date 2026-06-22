import {
  type Dealer,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { useCallback, useMemo } from "react";
import styles from "./RfqCard.module.css";
import { QuoteCard } from "./QuoteCard";

interface RfqCardProps {
  rfq: Rfq;
  quotes: readonly Quote[];
  instrument: Instrument | undefined;
  dealers: readonly Dealer[];
  onAccept: (quoteId: number) => void;
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
}: RfqCardProps) {
  const dealerMap = useMemo(() => {
    const m = new Map<number, Dealer>();
    for (const d of dealers) m.set(d.id, d);
    return m;
  }, [dealers]);

  const canDismiss = rfq.state !== RfqState.Open;

  const handleDismiss = useCallback(() => {
    if (onDismiss) onDismiss(rfq.id);
  }, [onDismiss, rfq.id]);

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
        {quotes.map((quote) => (
          <QuoteCard
            key={quote.id}
            quote={quote}
            dealer={dealerMap.get(quote.dealerId)}
            onAccept={rfq.state === RfqState.Open ? onAccept : undefined}
          />
        ))}
      </div>
    </div>
  );
}
