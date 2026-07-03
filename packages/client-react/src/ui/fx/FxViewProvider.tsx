import type { ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";

import {
  type BlotterTab,
  FxViewContext,
  type FxViewContextValue,
  type RatesTab,
} from "./fxViewContext";

/** Owns the FX view seam state (rates tab, blotter tab, quick filter, CSV
 * export handoff) for one workspace-tab render (App.tsx wraps WorkspaceEngine
 * in this). The export handler is stored in a ref, not state — invoking it
 * must not force a re-render, and the handler itself (bound to the blotter's
 * current filtered/sorted rows) is registered imperatively by FxBlotter. */
export function FxViewProvider({
  children,
}: FxViewProviderProps): ReactElement {
  const [ratesTab, setRatesTab] = useState<RatesTab>("rates");
  const [blotterTab, setBlotterTab] = useState<BlotterTab>("trades");
  const [quickFilter, setQuickFilter] = useState("");
  const exportHandlerRef = useRef<() => void>(() => {});

  function setExportCsvHandler(handler: () => void): void {
    exportHandlerRef.current = handler;
  }

  function exportCsv(): void {
    exportHandlerRef.current();
  }

  const value: FxViewContextValue = {
    ratesTab,
    setRatesTab,
    blotterTab,
    setBlotterTab,
    quickFilter,
    setQuickFilter,
    exportCsv,
    setExportCsvHandler,
  };

  return (
    <FxViewContext.Provider value={value}>{children}</FxViewContext.Provider>
  );
}

interface FxViewProviderProps {
  children: ReactNode;
}
