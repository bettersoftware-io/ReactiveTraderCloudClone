import { useMemo } from "react";
import { type Rfq, type Quote, type Instrument, type Dealer, type CreditTrade, RfqState } from "@rtc/domain";
import { useHooks } from "../../ui/hooks/HooksProvider";

const COLUMNS = [
  "Trade ID", "Status", "Trade Date", "Direction", "Counterparty",
  "CUSIP", "Security", "Quantity", "Order Type", "Unit Price",
] as const;

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function deriveTrades(
  rfqs: readonly Rfq[],
  allQuotes: ReadonlyMap<number, Quote>,
  instruments: Map<number, Instrument>,
  dealers: Map<number, Dealer>,
): CreditTrade[] {
  const trades: CreditTrade[] = [];

  for (const rfq of rfqs) {
    if (rfq.state !== RfqState.Closed) continue;

    // Find the accepted quote
    for (const quote of allQuotes.values()) {
      if (quote.rfqId !== rfq.id || quote.state.type !== "accepted") continue;

      const instrument = instruments.get(rfq.instrumentId);
      const dealer = dealers.get(quote.dealerId);

      trades.push({
        tradeId: rfq.id,
        status: "accepted",
        tradeDate: formatDate(rfq.creationTimestamp),
        direction: rfq.direction,
        counterParty: dealer?.name ?? `Dealer ${quote.dealerId}`,
        cusip: instrument?.cusip ?? "",
        security: instrument?.ticker ?? "",
        quantity: rfq.quantity,
        orderType: "AON",
        unitPrice: quote.state.price,
      });
      break;
    }
  }

  return trades.sort((a, b) => b.tradeId - a.tradeId);
}

export function CreditBlotter() {
  const hooks = useHooks();
  const rfqs = hooks.useRfqs();
  const allQuotes = hooks.useAllQuotes();
  const instruments = hooks.useInstruments();
  const dealers = hooks.useDealers();

  const instrumentMap = useMemo(() => {
    const m = new Map<number, Instrument>();
    for (const i of instruments) m.set(i.id, i);
    return m;
  }, [instruments]);

  const dealerMap = useMemo(() => {
    const m = new Map<number, Dealer>();
    for (const d of dealers) m.set(d.id, d);
    return m;
  }, [dealers]);

  const trades = useMemo(
    () => deriveTrades(rfqs, allQuotes, instrumentMap, dealerMap),
    [rfqs, allQuotes, instrumentMap, dealerMap],
  );

  return (
    <div style={{
      backgroundColor: "var(--bg-tile)",
      border: "1px solid var(--border-primary)",
      borderRadius: 6,
      padding: 12,
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Credit Trades
      </span>

      <div style={{ overflow: "auto", maxHeight: 250 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th key={col} style={{
                  padding: "6px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-secondary)",
                  textAlign: "left",
                  borderBottom: "1px solid var(--border-primary)",
                  whiteSpace: "nowrap",
                }}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade.tradeId}>
                <td style={cellStyle}>{trade.tradeId}</td>
                <td style={cellStyle}>Accepted</td>
                <td style={cellStyle}>{trade.tradeDate}</td>
                <td style={cellStyle}>{trade.direction}</td>
                <td style={cellStyle}>{trade.counterParty}</td>
                <td style={cellStyle}>{trade.cusip}</td>
                <td style={cellStyle}>{trade.security}</td>
                <td style={cellStyle}>{trade.quantity.toLocaleString()}</td>
                <td style={cellStyle}>{trade.orderType}</td>
                <td style={cellStyle}>${trade.unitPrice}</td>
              </tr>
            ))}
            {trades.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
                  No credit trades yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderBottom: "1px solid var(--border-subtle)",
  whiteSpace: "nowrap",
  color: "var(--text-primary)",
};
