import { useEffect, useRef, useState } from "react";
import {
  type PriceTick,
  type Price,
  type CurrencyPair,
  calculateSpread,
  detectMovement,
} from "@rtc/domain";
import { useServices } from "../../services/service-provider";

function enrichTick(
  tick: PriceTick,
  previousMid: number | undefined,
  pair: CurrencyPair,
): Price {
  return {
    ...tick,
    movementType: detectMovement(tick.mid, previousMid),
    spread: calculateSpread(tick.bid, tick.ask, pair.pipsPosition, pair.ratePrecision),
  };
}

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
  const prevMidRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    prevMidRef.current = undefined;

    (async () => {
      for await (const tick of pricing.getPriceUpdates(pair.symbol)) {
        if (cancelled) break;
        const enriched = enrichTick(tick, prevMidRef.current, pair);
        prevMidRef.current = tick.mid;
        setState((prev) => ({ price: enriched, version: prev.version + 1 }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pricing, pair]);

  return state;
}
