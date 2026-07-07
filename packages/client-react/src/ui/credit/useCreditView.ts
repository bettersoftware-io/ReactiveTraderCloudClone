import { useContext } from "react";

import {
  CreditViewContext,
  type CreditViewContextValue,
} from "./creditViewContext";

/** Reads the credit view seam context (quick filter, CSV export handoff).
 * Throws outside a CreditViewProvider — every credit head/body component
 * that consumes it renders under App.tsx's WorkspaceEngine, which always
 * wraps one (mirrors useFxView). */
export function useCreditView(): CreditViewContextValue {
  const ctx = useContext(CreditViewContext);

  if (!ctx) {
    throw new Error("useCreditView must be used within a CreditViewProvider");
  }

  return ctx;
}
