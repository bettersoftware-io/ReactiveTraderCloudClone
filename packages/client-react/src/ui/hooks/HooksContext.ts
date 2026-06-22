import { createContext } from "react";

import type { AppHooks } from "./createAppHooks";

/** The DI seam's context: holds the business-logic hooks bundle (or null until a
 * HooksProvider supplies it). Kept in its own module so UI components can import
 * the `useHooks` accessor without transitively pulling in the provider component
 * (which the composition root wires to concrete implementations). */
export const HooksContext = createContext<AppHooks | null>(null);
