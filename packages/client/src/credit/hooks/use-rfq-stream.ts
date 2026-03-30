import { useEffect, useCallback, useState } from "react";
import { type Rfq, type Quote, type RfqEvent } from "@rtc/domain";
import { useServices } from "../../services/service-provider";

interface RfqStreamState {
  rfqs: Map<number, Rfq>;
  quotes: Map<number, Quote>;
}

export function useRfqStream() {
  const { workflow } = useServices();
  const [state, setState] = useState<RfqStreamState>({
    rfqs: new Map(),
    quotes: new Map(),
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      for await (const event of workflow.subscribe()) {
        if (cancelled) break;

        setState((prev) => {
          const rfqs = new Map(prev.rfqs);
          const quotes = new Map(prev.quotes);

          switch (event.type) {
            case "startOfStateOfTheWorld":
              rfqs.clear();
              quotes.clear();
              break;
            case "endOfStateOfTheWorld":
              break;
            case "rfqCreated":
              rfqs.set(event.payload.id, event.payload);
              break;
            case "rfqClosed":
              rfqs.set(event.payload.id, event.payload);
              break;
            case "quoteCreated":
            case "quoteQuoted":
            case "quotePassed":
            case "quoteAccepted":
              quotes.set(event.payload.id, event.payload);
              break;
          }

          return { rfqs, quotes };
        });
      }
    })();

    return () => { cancelled = true; };
  }, [workflow]);

  const getRfqs = useCallback((): Rfq[] => {
    return [...state.rfqs.values()];
  }, [state.rfqs]);

  const getQuotesForRfq = useCallback(
    (rfqId: number): Quote[] => {
      return [...state.quotes.values()].filter((q) => q.rfqId === rfqId);
    },
    [state.quotes],
  );

  return { rfqs: getRfqs(), getQuotesForRfq, allQuotes: state.quotes };
}
