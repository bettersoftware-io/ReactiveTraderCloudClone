import { useEffect, useState } from "react";
import type { Dealer } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

export function useDealers(): readonly Dealer[] {
  const { dealers } = useServices();
  const [data, setData] = useState<readonly Dealer[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for await (const snapshot of dealers.subscribe()) {
        if (cancelled) break;
        setData(snapshot);
      }
    })();
    return () => { cancelled = true; };
  }, [dealers]);

  return data;
}
