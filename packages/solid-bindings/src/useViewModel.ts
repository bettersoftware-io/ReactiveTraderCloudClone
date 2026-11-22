import { useContext } from "solid-js";

import type { ViewModel } from "#/createViewModel";
import { ViewModelContext } from "#/ViewModelContext";

/** The seam UI components depend on: returns the ViewModel.
 * Importing this pulls in only the context + the ViewModel type — never the
 * provider component or any concrete implementation. Outside a
 * ViewModelProvider it throws Solid's `ContextNotFoundError` (the context is
 * default-less, see ViewModelContext.ts). */
export function useViewModel(): ViewModel {
  return useContext(ViewModelContext);
}
