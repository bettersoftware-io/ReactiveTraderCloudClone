import { useEffect, useState } from "react";
import { type PriceTick, PriceHistoryUseCase } from "@rtc/domain";
import { useServices } from "../../services/service-provider";

export function usePriceHistory(symbol: string): readonly PriceTick[] {
  const { pricing } = useServices();
  const [history, setHistory] = useState<readonly PriceTick[]>([]);

  useEffect(() => {
    const useCase = new PriceHistoryUseCase(pricing);
    let cancelled = false;

    (async () => {
      for await (const window of useCase.execute(symbol)) {
        if (cancelled) break;
        setHistory(window);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pricing, symbol]);

  return history;
}
