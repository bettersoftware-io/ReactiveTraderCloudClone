import { createContext } from "react";

import type { ViewModel } from "./createViewModel";

/** The DI seam's context: holds the ViewModel (or null until a
 * ViewModelProvider supplies it). Kept in its own module so UI components can import
 * the `useViewModel` accessor without transitively pulling in the provider component
 * (which the composition root wires to concrete implementations). */
export const ViewModelContext = createContext<ViewModel | null>(null);
