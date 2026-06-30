import { useEffect, useState } from "react";

function now(): string {
  return new Date().toTimeString().slice(0, 8);
}

export function useClock(): string {
  const [clock, setClock] = useState<string>(now);
  useEffect(() => {
    const id = setInterval(() => {
      setClock(now());
    }, 1000);

    return () => {
      clearInterval(id);
    };
  }, []);
  return clock;
}
