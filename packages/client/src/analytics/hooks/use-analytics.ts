import { useEffect, useState } from "react";
import type { PositionUpdates } from "@rtc/domain";
import { useServices } from "../../services/service-provider";

export function useAnalytics(): PositionUpdates | null {
  const { analytics } = useServices();
  const [data, setData] = useState<PositionUpdates | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      for await (const update of analytics.getAnalytics("USD")) {
        if (cancelled) break;
        setData(update);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [analytics]);

  return data;
}
