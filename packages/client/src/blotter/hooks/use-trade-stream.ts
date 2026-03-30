import { useEffect, useState } from "react";
import type { Trade } from "@rtc/domain";
import { useServices } from "../../services/service-provider";

export function useTradeStream(): readonly Trade[] {
  const { blotter } = useServices();
  const [trades, setTrades] = useState<readonly Trade[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      for await (const snapshot of blotter.getTradeStream()) {
        if (cancelled) break;
        setTrades(snapshot);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blotter]);

  return trades;
}
