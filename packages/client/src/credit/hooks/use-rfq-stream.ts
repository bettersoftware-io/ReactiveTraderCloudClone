import { useCallback, useEffect, useState } from "react";
import {
  type Quote,
  type Rfq,
  type RfqStreamState,
  WorkflowEventStreamUseCase,
} from "@rtc/domain";
import { useServices } from "../../services/service-provider";

function emptySnapshot(): RfqStreamState {
  return { rfqs: new Map(), quotes: new Map() };
}

export function useRfqStream() {
  const { workflow } = useServices();
  const [snapshot, setSnapshot] = useState<RfqStreamState>(emptySnapshot());

  useEffect(() => {
    const useCase = new WorkflowEventStreamUseCase(workflow);
    let cancelled = false;

    (async () => {
      for await (const next of useCase.execute()) {
        if (cancelled) break;
        setSnapshot(next);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workflow]);

  const getQuotesForRfq = useCallback(
    (rfqId: number): Quote[] =>
      Array.from(snapshot.quotes.values()).filter((q) => q.rfqId === rfqId),
    [snapshot],
  );

  return {
    rfqs: Array.from(snapshot.rfqs.values()) as Rfq[],
    getQuotesForRfq,
    allQuotes: snapshot.quotes as Map<number, Quote>,
  };
}
