import { useEffect, useState } from "react";

import type { CurrencyPair } from "@rtc/domain";

import { buildCurrencyPairsStream } from "#/data/currencyPairsStream";

export function useCurrencyPairs(): readonly CurrencyPair[] {
  const [pairs, setPairs] = useState<readonly CurrencyPair[]>([]);
  useEffect(() => {
    const subscription = buildCurrencyPairsStream().subscribe(setPairs);

    return () => {
      subscription.unsubscribe();
    };
  }, []);
  return pairs;
}
