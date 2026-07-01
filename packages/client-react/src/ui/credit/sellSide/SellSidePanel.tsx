import type { ReactElement } from "react";

import { ADAPTIVE_BANK_NAME, type Instrument, type Rfq } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { TradeTicket } from "./TradeTicket";

import styles from "./SellSidePanel.module.css";

export function SellSidePanel(): ReactElement {
  const { useRfqs, useInstruments, useDealers } = useViewModel();
  const rfqs = useRfqs();
  const instruments = useInstruments();
  const dealers = useDealers();

  const adaptiveBankId = dealers.find((d) => {
    return d.name === ADAPTIVE_BANK_NAME;
  })?.id;

  const instrumentMap = new Map<number, Instrument>();

  for (const i of instruments) {
    instrumentMap.set(i.id, i);
  }

  return (
    <div className={styles.panel}>
      <span className={styles.title}>Sell Side (Adaptive Bank)</span>

      {adaptiveBankId === undefined || rfqs.length === 0 ? (
        <div className={styles.empty}>No RFQs for Adaptive Bank</div>
      ) : (
        rfqs.map((rfq) => {
          return (
            <SellSideRfqRow
              key={rfq.id}
              rfq={rfq}
              adaptiveBankId={adaptiveBankId}
              instrumentMap={instrumentMap}
            />
          );
        })
      )}
    </div>
  );
}

interface SellSideRfqRowProps {
  rfq: Rfq;
  adaptiveBankId: number;
  instrumentMap: Map<number, Instrument>;
}

function SellSideRfqRow({
  rfq,
  adaptiveBankId,
  instrumentMap,
}: SellSideRfqRowProps): ReactElement | null {
  const { useQuotesForRfq } = useViewModel();
  const quotes = useQuotesForRfq(rfq.id);
  const abQuote = quotes.find((q) => {
    return q.dealerId === adaptiveBankId;
  });
  if (!abQuote) return null;
  return (
    <TradeTicket
      rfq={rfq}
      quote={abQuote}
      instrument={instrumentMap.get(rfq.instrumentId)}
    />
  );
}
