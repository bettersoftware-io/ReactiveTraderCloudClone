import type { JSX, ParentProps } from "solid-js";
import { createSignal } from "solid-js";

import {
  type BlotterTab,
  FxViewContext,
  type FxViewContextValue,
  type RatesTab,
} from "./fxViewContext";

/** Owns the FX view seam state (rates tab, blotter tab, quick filter, CSV
 * export handoff) for one workspace-tab render (App.tsx wraps WorkspaceEngine
 * in this). The export handler is stored in a plain mutable binding, not a
 * signal — invoking it must not force a re-render (moot in Solid, which has
 * no re-render, but the handler itself is registered imperatively by
 * FxBlotter and reading it must not be tracked). */
export function FxViewProvider(props: ParentProps): JSX.Element {
  const [ratesTab, setRatesTab] = createSignal<RatesTab>("rates");
  const [blotterTab, setBlotterTab] = createSignal<BlotterTab>("trades");
  const [quickFilter, setQuickFilter] = createSignal("");
  let exportHandler: () => void = noop;

  function setExportCsvHandler(handler: () => void): void {
    exportHandler = handler;
  }

  function exportCsv(): void {
    exportHandler();
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
    <FxViewContext.Provider value={value}>
      {props.children}
    </FxViewContext.Provider>
  );
}

function noop(): void {}
