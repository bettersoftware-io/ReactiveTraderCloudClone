import type { ReactElement } from "react";
import { useState } from "react";

import { type Dealer, type Instrument, type Rfq, RfqState } from "@rtc/domain";

import { useHooks } from "#/ui/hooks/useHooks";

import { RfqCard } from "./RfqCard";
import { type RfqFilter, RfqFilterTabs } from "./RfqFilterTabs";

import styles from "./RfqTilesPanel.module.css";

function filterMatches(state: string, filter: RfqFilter): boolean {
  switch (filter) {
    case "All":
      return true;
    case "Live":
      return state === RfqState.Open;
    case "Done":
      return state === RfqState.Closed;
    case "Expired":
      return state === RfqState.Expired;
    case "Cancelled":
      return state === RfqState.Cancelled;
  }
}

interface RfqTileRowProps {
  rfq: Rfq;
  instrumentMap: Map<number, Instrument>;
  dealers: readonly Dealer[];
  onAccept: (quoteId: number) => Promise<void>;
  onDismiss: (rfqId: number) => void;
}

function RfqTileRow({
  rfq,
  instrumentMap,
  dealers,
  onAccept,
  onDismiss,
}: RfqTileRowProps): ReactElement {
  const quotes = useHooks().useQuotesForRfq(rfq.id);
  return (
    <RfqCard
      rfq={rfq}
      quotes={quotes}
      instrument={instrumentMap.get(rfq.instrumentId)}
      dealers={dealers}
      onAccept={onAccept}
      onDismiss={onDismiss}
    />
  );
}

export function RfqTilesPanel(): ReactElement {
  const { useRfqs, useInstruments, useDealers, useAcceptQuote } = useHooks();
  const rfqs = useRfqs();
  const instruments = useInstruments();
  const dealers = useDealers();
  const acceptQuote = useAcceptQuote();
  const [filter, setFilter] = useState<RfqFilter>("Live");
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const instrumentMap = new Map<number, Instrument>();

  for (const i of instruments) {
    instrumentMap.set(i.id, i);
  }

  const filteredRfqs = rfqs
    .filter((r) => {
      return filterMatches(r.state, filter) && !dismissed.has(r.id);
    })
    .sort((a, b) => {
      return b.creationTimestamp - a.creationTimestamp;
    });

  async function handleAccept(quoteId: number): Promise<void> {
    await acceptQuote(quoteId);
  }

  function handleDismiss(rfqId: number): void {
    setDismissed((prev) => {
      return new Set(prev).add(rfqId);
    });
  }

  return (
    <div className={styles.panel}>
      <RfqFilterTabs selected={filter} onChange={setFilter} />

      {filteredRfqs.length === 0 ? (
        <div className={styles.empty}>No RFQs to display</div>
      ) : (
        <div className={styles.grid}>
          {filteredRfqs.map((rfq) => {
            return (
              <RfqTileRow
                key={rfq.id}
                rfq={rfq}
                instrumentMap={instrumentMap}
                dealers={dealers}
                onAccept={handleAccept}
                onDismiss={handleDismiss}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
