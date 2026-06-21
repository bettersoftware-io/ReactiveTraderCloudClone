import type { Dealer, Quote } from "@rtc/domain";
import { useCallback } from "react";
import styles from "./QuoteCard.module.css";

interface QuoteCardProps {
  quote: Quote;
  dealer: Dealer | undefined;
  onAccept?: (quoteId: number) => void;
}

function displayText(state: Quote["state"]): string {
  switch (state.type) {
    case "pendingWithoutPrice":
    case "rejectedWithoutPrice":
      return "Awaiting response";
    case "pendingWithPrice":
    case "accepted":
    case "rejectedWithPrice":
      return `$${state.price}`;
    case "passed":
      return "Passed";
  }
}

export function QuoteCard({ quote, dealer, onAccept }: QuoteCardProps) {
  const canAccept = quote.state.type === "pendingWithPrice" && onAccept;

  const handleAccept = useCallback(() => {
    if (canAccept) onAccept!(quote.id);
  }, [canAccept, onAccept, quote.id]);

  return (
    <div className={styles.quoteCard} data-state={quote.state.type}>
      <div className={styles.info}>
        <span className={styles.dealerName}>
          {dealer?.name ?? `Dealer ${quote.dealerId}`}
        </span>
        <span className={styles.priceText}>{displayText(quote.state)}</span>
      </div>
      {canAccept && (
        <button onClick={handleAccept} className={styles.acceptBtn}>
          Accept
        </button>
      )}
    </div>
  );
}
