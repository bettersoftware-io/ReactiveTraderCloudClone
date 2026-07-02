import { useCallback, useEffect, useState } from "react";

// Generic single-panel maximize toggle + localStorage persistence, lifted out
// of FX's useDockState (PROTO 1123 toggleMax) so both the FX and Credit docks
// share one implementation. `valid` is the set of panel ids a given dock
// recognizes — a persisted id outside it is ignored on read.
export interface MaxPanelApi<T extends string> {
  maxPanel: T | null;
  toggleMax(id: T): void;
}

export function useMaxPanel<T extends string>(
  storageKey: string,
  valid: readonly T[],
): MaxPanelApi<T> {
  const [maxPanel, setMaxPanel] = useState<T | null>(() => {
    const stored = localStorage.getItem(storageKey);
    return stored != null && (valid as readonly string[]).includes(stored)
      ? (stored as T)
      : null;
  });

  const toggleMax = useCallback((id: T) => {
    setMaxPanel((prev) => {
      return prev === id ? null : id;
    });
  }, []);

  // Persistence lives outside the updater: StrictMode may run a functional
  // updater twice per commit, and updaters must stay pure.
  useEffect(() => {
    if (maxPanel == null) {
      localStorage.removeItem(storageKey);
    } else {
      localStorage.setItem(storageKey, maxPanel);
    }
  }, [maxPanel, storageKey]);

  return { maxPanel, toggleMax };
}
