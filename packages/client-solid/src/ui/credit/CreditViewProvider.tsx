import type { JSX, ParentProps } from "solid-js";
import { createSignal } from "solid-js";

import {
  CreditViewContext,
  type CreditViewContextValue,
} from "./creditViewContext";

/** Owns the credit view seam state (quick filter, CSV export handoff) for one
 * workspace-tab render (App.tsx wraps WorkspaceEngine in this, next to
 * FxViewProvider). The export handler is stored in a plain mutable binding,
 * not a signal — invoking it must not force a re-render (moot in Solid,
 * which has no re-render, but the handler itself is registered imperatively
 * by CreditBlotter and reading it must not be tracked). */
export function CreditViewProvider(props: ParentProps): JSX.Element {
  const [quickFilter, setQuickFilter] = createSignal("");
  let exportHandler: () => void = noop;

  function setExportCsvHandler(handler: () => void): void {
    exportHandler = handler;
  }

  function exportCsv(): void {
    exportHandler();
  }

  const value: CreditViewContextValue = {
    quickFilter,
    setQuickFilter,
    exportCsv,
    setExportCsvHandler,
  };

  return (
    <CreditViewContext.Provider value={value}>
      {props.children}
    </CreditViewContext.Provider>
  );
}

function noop(): void {}
