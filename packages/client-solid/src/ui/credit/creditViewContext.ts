import type { Accessor } from "solid-js";
import { createContext } from "solid-js";

export interface CreditViewContextValue {
  quickFilter: Accessor<string>;
  setQuickFilter: (value: string) => void;
  exportCsv: () => void;
  setExportCsvHandler: (handler: () => void) => void;
}

/** Credit view seam context (mirrors fxViewContext): cross-panel head/body
 * state shared between the credit-blotter panel's head slot
 * (CreditBlotterHead — quick filter + CSV chip) and its body (CreditBlotter —
 * registers the CSV export handler bound to its current filtered/sorted
 * rows). Split from the provider so `useCreditView` consumers don't
 * transitively import the provider component. */
export const CreditViewContext = createContext<CreditViewContextValue | null>(
  null,
);
