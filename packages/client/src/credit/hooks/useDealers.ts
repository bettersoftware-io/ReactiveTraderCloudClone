import { useEffect, useState } from "react";
import type { Dealer } from "@rtc/domain";
import { useServices } from "../../services/ServiceProvider";

export function useDealers(): readonly Dealer[] {
  const { dealers } = useServices();
  const [data, setData] = useState<readonly Dealer[]>([]);

  useEffect(() => {
    const sub = dealers.getDealers().subscribe(setData);
    return () => sub.unsubscribe();
  }, [dealers]);

  return data;
}
