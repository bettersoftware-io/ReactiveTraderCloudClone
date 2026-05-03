import { useEffect, useState } from "react";
import { type PriceTick, PriceHistoryUseCase } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

export function usePriceHistory(symbol: string): readonly PriceTick[] {
  const { pricing } = useServices();
  const [history, setHistory] = useState<readonly PriceTick[]>([]);

  useEffect(() => {
    const useCase = new PriceHistoryUseCase(pricing);
    const sub = useCase.execute(symbol).subscribe(setHistory);
    return () => sub.unsubscribe();
  }, [pricing, symbol]);

  return history;
}
