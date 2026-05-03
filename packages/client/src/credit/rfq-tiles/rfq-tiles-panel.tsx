import { useCallback, useMemo, useState } from "react";
import { RfqState, type Instrument, type Dealer } from "@rtc/domain";
import { useRfqStream } from "../hooks/use-rfq-stream";
import { useInstruments } from "../hooks/use-instruments";
import { useDealers } from "../hooks/use-dealers";
import { useServices } from "../../services/ServiceProvider";
import { RfqCard } from "./rfq-card";
import { RfqFilterTabs, type RfqFilter } from "./rfq-filter-tabs";

function filterMatches(state: string, filter: RfqFilter): boolean {
  switch (filter) {
    case "All": return true;
    case "Live": return state === RfqState.Open;
    case "Done": return state === RfqState.Closed;
    case "Expired": return state === RfqState.Expired;
    case "Cancelled": return state === RfqState.Cancelled;
  }
}

export function RfqTilesPanel() {
  const { rfqs, getQuotesForRfq } = useRfqStream();
  const instruments = useInstruments();
  const dealers = useDealers();
  const { workflow } = useServices();
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
      await workflow.accept(quoteId);
    },
    [workflow],
  );

  const handleDismiss = useCallback((rfqId: number) => {
    setDismissed((prev) => new Set(prev).add(rfqId));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <RfqFilterTabs selected={filter} onChange={setFilter} />

      {filteredRfqs.length === 0 ? (
        <div style={{
          padding: 24,
          textAlign: "center",
          color: "var(--text-muted)",
          fontSize: 12,
        }}>
          No RFQs to display
        </div>
      ) : (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 8,
        }}>
          {filteredRfqs.map((rfq) => (
            <RfqCard
              key={rfq.id}
              rfq={rfq}
              quotes={getQuotesForRfq(rfq.id)}
              instrument={instrumentMap.get(rfq.instrumentId)}
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
