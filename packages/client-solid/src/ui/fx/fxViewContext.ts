import type { Accessor } from "solid-js";
import { createContext } from "solid-js";

export type RatesTab = "rates" | "watchlist";
export type BlotterTab = "trades" | "activity";

export interface FxViewContextValue {
  ratesTab: Accessor<RatesTab>;
  setRatesTab: (tab: RatesTab) => void;
  blotterTab: Accessor<BlotterTab>;
  setBlotterTab: (tab: BlotterTab) => void;
  quickFilter: Accessor<string>;
  setQuickFilter: (value: string) => void;
  exportCsv: () => void;
  setExportCsvHandler: (handler: () => void) => void;
}

/** FX view seam context: cross-panel head/body state shared between a panel's
 * head-slot tabs (LiveRatesHead, blotter head) and its body (LiveRatesPanel,
 * FxBlotter). Split from the provider so `useFxView` consumers don't
 * transitively import the provider component. */
export const FxViewContext = createContext<FxViewContextValue | null>(null);
