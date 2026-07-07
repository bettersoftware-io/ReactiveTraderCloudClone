import type { ReactElement, ReactNode } from "react";
import { useRef, useState } from "react";

import {
  CreditViewContext,
  type CreditViewContextValue,
} from "./creditViewContext";

/** Owns the credit view seam state (quick filter, CSV export handoff) for one
 * workspace-tab render (App.tsx wraps WorkspaceEngine in this, next to
 * FxViewProvider). The export handler is stored in a ref, not state —
 * invoking it must not force a re-render, and the handler itself (bound to
 * the blotter's current filtered/sorted rows) is registered imperatively by
 * CreditBlotter. */
export function CreditViewProvider({
  children,
}: CreditViewProviderProps): ReactElement {
  const [quickFilter, setQuickFilter] = useState("");
  const exportHandlerRef = useRef<() => void>(() => {});

  function setExportCsvHandler(handler: () => void): void {
    exportHandlerRef.current = handler;
  }

  function exportCsv(): void {
    exportHandlerRef.current();
  }

  const value: CreditViewContextValue = {
    quickFilter,
    setQuickFilter,
    exportCsv,
    setExportCsvHandler,
  };

  return (
    <CreditViewContext.Provider value={value}>
      {children}
    </CreditViewContext.Provider>
  );
}

interface CreditViewProviderProps {
  children: ReactNode;
}
