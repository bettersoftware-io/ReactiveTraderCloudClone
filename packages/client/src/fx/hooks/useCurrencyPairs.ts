import { useEffect, useState } from "react";
import type { CurrencyPair } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

export function useCurrencyPairs(): readonly CurrencyPair[] {
  const { referenceData } = useServices();
  const [pairs, setPairs] = useState<readonly CurrencyPair[]>([]);

  useEffect(() => {
    const sub = referenceData.getCurrencyPairs().subscribe(setPairs);
    return () => sub.unsubscribe();
  }, [referenceData]);

  return pairs;
}
