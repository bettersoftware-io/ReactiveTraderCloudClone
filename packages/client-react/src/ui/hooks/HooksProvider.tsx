import type { ReactElement, ReactNode } from "react";

import type { AppHooks } from "./createAppHooks";
import { HooksContext } from "./HooksContext";

interface HooksProviderProps {
  hooks: AppHooks;
  children: ReactNode;
}

/** Composition-root component: supplies the concrete business-logic hooks to the
 * tree. Only the app entrypoint (and test harnesses) import this; UI components
 * read the seam via `useHooks` so they never depend on the wiring. */
export function HooksProvider({
  hooks,
  children,
}: HooksProviderProps): ReactElement {
  return (
    <HooksContext.Provider value={hooks}>{children}</HooksContext.Provider>
  );
}
