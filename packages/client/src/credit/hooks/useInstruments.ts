import { useEffect, useState } from "react";
import type { Instrument } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

export function useInstruments(): readonly Instrument[] {
  const { instruments } = useServices();
  const [data, setData] = useState<readonly Instrument[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for await (const snapshot of instruments.subscribe()) {
        if (cancelled) break;
        setData(snapshot);
      }
    })();
    return () => { cancelled = true; };
  }, [instruments]);

  return data;
}
