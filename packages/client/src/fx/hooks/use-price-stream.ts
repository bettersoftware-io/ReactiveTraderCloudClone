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

export function usePriceStream(pair: CurrencyPair): Price | null {
  const { pricing } = useServices();
  const [price, setPrice] = useState<Price | null>(null);
  const prevMidRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    prevMidRef.current = undefined;

    (async () => {
      for await (const tick of pricing.getPriceUpdates(pair.symbol)) {
        if (cancelled) break;
        const enriched = enrichTick(tick, prevMidRef.current, pair);
        prevMidRef.current = tick.mid;
        setPrice(enriched);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pricing, pair]);

  return price;
}
