import { useContext } from "react";
import type { AppHooks } from "./createAppHooks";
import { HooksContext } from "./HooksContext";

/** The seam UI components depend on: returns the business-logic hooks bundle.
 * Importing this pulls in only the context + the AppHooks type — never the
 * provider component or any concrete implementation. */
export function useHooks(): AppHooks {
  const ctx = useContext(HooksContext);
  if (!ctx) throw new Error("useHooks must be used within HooksProvider");
  return ctx;
}
