import { useEffect, useRef, useState } from "react";
import { type PriceTick, PRICE_HISTORY_SIZE } from "@rtc/domain";
import { useServices } from "../../services/service-provider";

export function usePriceHistory(symbol: string): readonly PriceTick[] {
  const { pricing } = useServices();
  const [history, setHistory] = useState<readonly PriceTick[]>([]);
  const bufferRef = useRef<PriceTick[]>([]);

  useEffect(() => {
    let cancelled = false;
    bufferRef.current = [];

    (async () => {
      for await (const tick of pricing.getPriceUpdates(symbol)) {
        if (cancelled) break;
        const buf = bufferRef.current;
        buf.push(tick);
        if (buf.length > PRICE_HISTORY_SIZE) {
          buf.shift();
        }
        setHistory([...buf]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pricing, symbol]);

  return history;
}
