import { useMemo } from "react";
import { ADAPTIVE_BANK_NAME, type Instrument, type Rfq } from "@rtc/domain";
import { useHooks } from "../../hooks/HooksProvider";
import { TradeTicket } from "./TradeTicket";
import styles from "./SellSidePanel.module.css";

interface SellSideRfqRowProps {
  rfq: Rfq;
  adaptiveBankId: number;
  instrumentMap: Map<number, Instrument>;
}

function SellSideRfqRow({ rfq, adaptiveBankId, instrumentMap }: SellSideRfqRowProps) {
  const quotes = useHooks().useQuotesForRfq(rfq.id);
  const abQuote = quotes.find((q) => q.dealerId === adaptiveBankId);
  if (!abQuote) return null;
  return (
    <TradeTicket
      rfq={rfq}
      quote={abQuote}
      instrument={instrumentMap.get(rfq.instrumentId)}
    />
  );
}

export function SellSidePanel() {
  const hooks = useHooks();
  const rfqs = hooks.useRfqs();
  const instruments = hooks.useInstruments();
  const dealers = hooks.useDealers();

  const adaptiveBankId = useMemo(
    () => dealers.find((d) => d.name === ADAPTIVE_BANK_NAME)?.id,
    [dealers],
  );

  const instrumentMap = useMemo(() => {
    const m = new Map<number, Instrument>();
    for (const i of instruments) m.set(i.id, i);
    return m;
  }, [instruments]);

  return (
    <div className={styles.panel}>
      <span className={styles.title}>
        Sell Side (Adaptive Bank)
      </span>

      {adaptiveBankId === undefined || rfqs.length === 0 ? (
        <div className={styles.empty}>
          No RFQs for Adaptive Bank
        </div>
      ) : (
        rfqs.map((rfq) => (
          <SellSideRfqRow
            key={rfq.id}
            rfq={rfq}
            adaptiveBankId={adaptiveBankId}
            instrumentMap={instrumentMap}
          />
        ))
      )}
    </div>
  );
}
