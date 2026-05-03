import { useEffect, useState } from "react";
import type { Instrument } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

export function useInstruments(): readonly Instrument[] {
  const { instruments } = useServices();
  const [data, setData] = useState<readonly Instrument[]>([]);

  useEffect(() => {
    const sub = instruments.getInstruments().subscribe(setData);
    return () => sub.unsubscribe();
  }, [instruments]);

  return data;
}
