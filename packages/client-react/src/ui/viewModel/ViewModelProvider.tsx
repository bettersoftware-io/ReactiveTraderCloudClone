import type { ReactElement, ReactNode } from "react";

import type { ViewModel } from "./createViewModel";
import { ViewModelContext } from "./ViewModelContext";

interface ViewModelProviderProps {
  viewModel: ViewModel;
  children: ReactNode;
}

/** Composition-root component: supplies the concrete ViewModel to the
 * tree. Only the app entrypoint (and test harnesses) import this; UI components
 * read the seam via `useViewModel` so they never depend on the wiring. */
export function ViewModelProvider({
  viewModel,
  children,
}: ViewModelProviderProps): ReactElement {
  return (
    <ViewModelContext.Provider value={viewModel}>
      {children}
    </ViewModelContext.Provider>
  );
}
