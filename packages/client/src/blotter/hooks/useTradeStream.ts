import { useEffect, useState } from "react";
import type { Trade } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

export function useTradeStream(): readonly Trade[] {
  const { blotter } = useServices();
  const [trades, setTrades] = useState<readonly Trade[]>([]);

  useEffect(() => {
    const sub = blotter.getTradeStream().subscribe(setTrades);
    return () => sub.unsubscribe();
  }, [blotter]);

  return trades;
}
