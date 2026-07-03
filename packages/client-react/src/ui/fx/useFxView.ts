import { useContext } from "react";

import { FxViewContext, type FxViewContextValue } from "./fxViewContext";

/** Reads the FX view seam context (rates tab, blotter tab, quick filter, CSV
 * export handoff). Throws outside a FxViewProvider — every FX head/body
 * component that consumes it renders under App.tsx's WorkspaceEngine, which
 * always wraps one. */
export function useFxView(): FxViewContextValue {
  const ctx = useContext(FxViewContext);

  if (!ctx) {
    throw new Error("useFxView must be used within a FxViewProvider");
  }

  return ctx;
}
