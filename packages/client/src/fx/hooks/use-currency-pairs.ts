import { useEffect, useState } from "react";
import type { CurrencyPair } from "@rtc/domain";
import { useServices } from "../../services/service-provider";

export function useCurrencyPairs(): readonly CurrencyPair[] {
  const { referenceData } = useServices();
  const [pairs, setPairs] = useState<readonly CurrencyPair[]>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      for await (const snapshot of referenceData.getCurrencyPairs()) {
        if (cancelled) break;
        setPairs(snapshot);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [referenceData]);

  return pairs;
}
