import { useContext } from "react";

import type { ViewModel } from "./createViewModel";
import { ViewModelContext } from "./ViewModelContext";

/** The seam UI components depend on: returns the ViewModel.
 * Importing this pulls in only the context + the ViewModel type — never the
 * provider component or any concrete implementation. */
export function useViewModel(): ViewModel {
  const ctx = useContext(ViewModelContext);
  if (!ctx)
    throw new Error("useViewModel must be used within ViewModelProvider");
  return ctx;
}
