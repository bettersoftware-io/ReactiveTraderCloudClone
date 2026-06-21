import { useCallback, useMemo, useState } from "react";
import { RfqState, type Instrument, type Dealer, type Rfq } from "@rtc/domain";
import { useHooks } from "../../hooks/HooksProvider";
import { RfqCard } from "./RfqCard";
import { RfqFilterTabs, type RfqFilter } from "./RfqFilterTabs";
import styles from "./RfqTilesPanel.module.css";

function filterMatches(state: string, filter: RfqFilter): boolean {
  switch (filter) {
    case "All": return true;
    case "Live": return state === RfqState.Open;
    case "Done": return state === RfqState.Closed;
    case "Expired": return state === RfqState.Expired;
    case "Cancelled": return state === RfqState.Cancelled;
  }
}

interface RfqTileRowProps {
  rfq: Rfq;
  instrumentMap: Map<number, Instrument>;
  dealers: readonly Dealer[];
  onAccept: (quoteId: number) => Promise<void>;
  onDismiss: (rfqId: number) => void;
}

function RfqTileRow({ rfq, instrumentMap, dealers, onAccept, onDismiss }: RfqTileRowProps) {
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

export function RfqTilesPanel() {
  const hooks = useHooks();
  const rfqs = hooks.useRfqs();
  const instruments = hooks.useInstruments();
  const dealers = hooks.useDealers();
  const acceptQuote = hooks.useAcceptQuote();
  const [filter, setFilter] = useState<RfqFilter>("Live");
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const instrumentMap = useMemo(() => {
    const m = new Map<number, Instrument>();
    for (const i of instruments) m.set(i.id, i);
    return m;
  }, [instruments]);

  const filteredRfqs = useMemo(
    () => rfqs
      .filter((r) => filterMatches(r.state, filter) && !dismissed.has(r.id))
      .sort((a, b) => b.creationTimestamp - a.creationTimestamp),
    [rfqs, filter, dismissed],
  );

  const handleAccept = useCallback(
    async (quoteId: number) => {
      await acceptQuote(quoteId);
    },
    [acceptQuote],
  );

  const handleDismiss = useCallback((rfqId: number) => {
    setDismissed((prev) => new Set(prev).add(rfqId));
  }, []);

  return (
    <div className={styles.panel}>
      <RfqFilterTabs selected={filter} onChange={setFilter} />

      {filteredRfqs.length === 0 ? (
        <div className={styles.empty}>
          No RFQs to display
        </div>
      ) : (
        <div className={styles.grid}>
          {filteredRfqs.map((rfq) => (
            <RfqTileRow
              key={rfq.id}
              rfq={rfq}
              instrumentMap={instrumentMap}
              dealers={dealers}
              onAccept={handleAccept}
              onDismiss={handleDismiss}
            />
          ))}
        </div>
      )}
    </div>
  );
}
