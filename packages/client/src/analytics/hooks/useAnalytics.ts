import { useEffect, useState } from "react";
import { type PositionUpdates, AnalyticsUseCase } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

interface AnalyticsResult {
  data: PositionUpdates | null;
  /** Increments on each update — use with useStaleDetection */
  version: number;
}

export function useAnalytics(): AnalyticsResult {
  const { analytics } = useServices();
  const [state, setState] = useState<AnalyticsResult>({ data: null, version: 0 });

  useEffect(() => {
    const useCase = new AnalyticsUseCase(analytics);
    const sub = useCase.execute().subscribe((update) => {
      setState((prev) => ({ data: update, version: prev.version + 1 }));
    });

    return () => {
      sub.unsubscribe();
    };
  }, [analytics]);

  return state;
}
