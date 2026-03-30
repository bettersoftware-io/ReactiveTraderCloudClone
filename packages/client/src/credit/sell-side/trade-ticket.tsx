import { useCallback, useState } from "react";
import { type Rfq, type Quote, type Instrument, RfqState } from "@rtc/domain";
import { useServices } from "../../services/service-provider";

interface TradeTicketProps {
  rfq: Rfq;
  quote: Quote;
  instrument: Instrument | undefined;
}

export function TradeTicket({ rfq, quote, instrument }: TradeTicketProps) {
  const { workflow } = useServices();
  const [price, setPrice] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const isActive = rfq.state === RfqState.Open && quote.state.type === "pendingWithoutPrice";
  const hasResponded = quote.state.type !== "pendingWithoutPrice";

  const handleSubmit = useCallback(async () => {
    const num = parseFloat(price);
    if (isNaN(num) || num <= 0) return;
    await workflow.quote({ quoteId: quote.id, price: num });
    setSubmitted(true);
  }, [workflow, quote.id, price]);

  const handlePass = useCallback(async () => {
    await workflow.pass(quote.id);
    setSubmitted(true);
  }, [workflow, quote.id]);

  return (
    <div style={{
      backgroundColor: "var(--bg-tile)",
      border: "1px solid var(--border-primary)",
      borderRadius: 6,
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 6,
      opacity: rfq.state !== RfqState.Open ? 0.6 : 1,
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
          {instrument?.name ?? `Instrument #${rfq.instrumentId}`}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {instrument?.cusip} | {rfq.direction} | Qty: {rfq.quantity.toLocaleString()}
        </div>
      </div>

      {hasResponded || submitted ? (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", padding: "4px 0" }}>
          {quote.state.type === "passed" ? "Passed" :
           quote.state.type === "pendingWithPrice" ? `Quoted: $${quote.state.price}` :
           rfq.state === RfqState.Cancelled ? "RFQ Cancelled" :
           rfq.state === RfqState.Expired ? "RFQ Expired" :
           "Responded"}
        </div>
      ) : isActive ? (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Price"
            style={{
              flex: 1,
              padding: "4px 6px",
              fontSize: 12,
              border: "1px solid var(--border-primary)",
              borderRadius: 3,
              backgroundColor: "transparent",
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!price}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 600,
              border: "none",
              borderRadius: 3,
              backgroundColor: "var(--accent-positive)",
              color: "#fff",
              cursor: price ? "pointer" : "not-allowed",
              opacity: price ? 1 : 0.5,
            }}
          >
            Submit
          </button>
          <button
            onClick={handlePass}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              border: "1px solid var(--border-primary)",
              borderRadius: 3,
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            Pass
          </button>
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {rfq.state === RfqState.Cancelled ? "Cancelled" : rfq.state === RfqState.Expired ? "Expired" : "Closed"}
        </div>
      )}
    </div>
  );
}
