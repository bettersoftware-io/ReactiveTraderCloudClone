import { useCallback } from "react";
import type { Quote, Dealer } from "@rtc/domain";

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

function stateColor(state: Quote["state"]): string {
  switch (state.type) {
    case "accepted":
      return "var(--accent-positive)";
    case "rejectedWithPrice":
    case "rejectedWithoutPrice":
      return "var(--accent-negative)";
    case "passed":
      return "var(--text-muted)";
    default:
      return "var(--text-primary)";
  }
}

export function QuoteCard({ quote, dealer, onAccept }: QuoteCardProps) {
  const canAccept = quote.state.type === "pendingWithPrice" && onAccept;

  const handleAccept = useCallback(() => {
    if (canAccept) onAccept!(quote.id);
  }, [canAccept, onAccept, quote.id]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "4px 8px",
        borderRadius: 3,
        border: "1px solid var(--border-subtle)",
        backgroundColor: quote.state.type === "accepted" ? "rgba(34, 197, 94, 0.1)" : "transparent",
        opacity: quote.state.type === "passed" || quote.state.type === "rejectedWithoutPrice" || quote.state.type === "rejectedWithPrice" ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {dealer?.name ?? `Dealer ${quote.dealerId}`}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: stateColor(quote.state) }}>
          {displayText(quote.state)}
        </span>
      </div>
      {canAccept && (
        <button
          onClick={handleAccept}
          style={{
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 600,
            border: "none",
            borderRadius: 3,
            backgroundColor: "var(--accent-positive)",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Accept
        </button>
      )}
    </div>
  );
}
