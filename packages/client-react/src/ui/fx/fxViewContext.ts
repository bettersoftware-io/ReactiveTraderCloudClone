import { createContext } from "react";

export type RatesTab = "rates" | "watchlist";
export type BlotterTab = "trades" | "activity";

export interface FxViewContextValue {
  ratesTab: RatesTab;
  setRatesTab: (tab: RatesTab) => void;
  blotterTab: BlotterTab;
  setBlotterTab: (tab: BlotterTab) => void;
  quickFilter: string;
  setQuickFilter: (value: string) => void;
  exportCsv: () => void;
  setExportCsvHandler: (handler: () => void) => void;
}

/** FX view seam context: cross-panel head/body state shared between a panel's
 * head-slot tabs (LiveRatesHead, Task 12's blotter head) and its body
 * (LiveRatesPanel, FxBlotter). Split from the provider so `useFxView`
 * consumers don't transitively import the provider component. */
export const FxViewContext = createContext<FxViewContextValue | null>(null);
