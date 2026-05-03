import { useMemo } from "react";
import { ADAPTIVE_BANK_NAME, type Instrument } from "@rtc/domain";
import { useRfqStream } from "../hooks/useRfqStream";
import { useInstruments } from "../hooks/useInstruments";
import { useDealers } from "../hooks/useDealers";
import { TradeTicket } from "./TradeTicket";

export function SellSidePanel() {
  const { rfqs, getQuotesForRfq } = useRfqStream();
  const instruments = useInstruments();
  const dealers = useDealers();

  const adaptiveBankId = useMemo(
    () => dealers.find((d) => d.name === ADAPTIVE_BANK_NAME)?.id,
    [dealers],
  );

  const instrumentMap = useMemo(() => {
    const m = new Map<number, Instrument>();
    for (const i of instruments) m.set(i.id, i);
    return m;
  }, [instruments]);

  // Filter RFQs that include Adaptive Bank
  const tickets = useMemo(() => {
    if (adaptiveBankId === undefined) return [];

    return rfqs
      .map((rfq) => {
        const quotes = getQuotesForRfq(rfq.id);
        const abQuote = quotes.find((q) => q.dealerId === adaptiveBankId);
        if (!abQuote) return null;
        return { rfq, quote: abQuote };
      })
      .filter(Boolean) as { rfq: (typeof rfqs)[number]; quote: ReturnType<typeof getQuotesForRfq>[number] }[];
  }, [rfqs, getQuotesForRfq, adaptiveBankId]);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
        Sell Side (Adaptive Bank)
      </span>

      {tickets.length === 0 ? (
        <div style={{ padding: 16, textAlign: "center", color: "var(--text-muted)", fontSize: 12 }}>
          No RFQs for Adaptive Bank
        </div>
      ) : (
        tickets.map(({ rfq, quote }) => (
          <TradeTicket
            key={quote.id}
            rfq={rfq}
            quote={quote}
            instrument={instrumentMap.get(rfq.instrumentId)}
          />
        ))
      )}
    </div>
  );
}
