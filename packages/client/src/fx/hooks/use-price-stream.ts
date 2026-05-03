import { useEffect, useState } from "react";
import {
  type Price,
  type CurrencyPair,
  PriceStreamUseCase,
} from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

interface PriceStreamResult {
  price: Price | null;
  /** Increments on each new tick — use with useStaleDetection */
  version: number;
}

export function usePriceStream(pair: CurrencyPair): PriceStreamResult {
  const { pricing } = useServices();
  const [state, setState] = useState<{ price: Price | null; version: number }>({
    price: null,
    version: 0,
  });

  useEffect(() => {
    const useCase = new PriceStreamUseCase(pricing);
    let cancelled = false;

    (async () => {
      for await (const enriched of useCase.execute(pair)) {
        if (cancelled) break;
        setState((prev) => ({ price: enriched, version: prev.version + 1 }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pricing, pair]);

  return state;
}
