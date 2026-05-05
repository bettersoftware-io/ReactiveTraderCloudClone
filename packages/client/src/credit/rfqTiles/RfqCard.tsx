import { useCallback, useMemo } from "react";
import { type Rfq, type Quote, type Instrument, type Dealer, RfqState } from "@rtc/domain";
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
    case RfqState.Open: return "Live";
    case RfqState.Closed: return "Done";
    case RfqState.Expired: return "Expired";
    case RfqState.Cancelled: return "Cancelled";
  }
}

function stateBadgeColor(state: RfqState): string {
  switch (state) {
    case RfqState.Open: return "var(--accent-positive)";
    case RfqState.Closed: return "var(--accent-primary)";
    case RfqState.Expired: return "var(--accent-aware)";
    case RfqState.Cancelled: return "var(--text-muted)";
  }
}

export function RfqCard({ rfq, quotes, instrument, dealers, onAccept, onDismiss }: RfqCardProps) {
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
    <div style={{
      backgroundColor: "var(--bg-tile)",
      border: "1px solid var(--border-primary)",
      borderRadius: 6,
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      minWidth: 280,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            {instrument?.name ?? `Instrument #${rfq.instrumentId}`}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            {rfq.direction} | Qty: {rfq.quantity.toLocaleString()}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 10,
            fontWeight: 600,
            padding: "2px 6px",
            borderRadius: 3,
            backgroundColor: stateBadgeColor(rfq.state),
            color: "#fff",
          }}>
            {stateLabel(rfq.state)}
          </span>
          {canDismiss && onDismiss && (
            <button
              onClick={handleDismiss}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                fontSize: 14,
                padding: 0,
              }}
            >
              \u2715
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
