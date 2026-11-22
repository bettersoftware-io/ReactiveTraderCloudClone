import { createContext } from "solid-js";

import type { ViewModel } from "#/createViewModel";

/** The DI seam's context: holds the ViewModel a ViewModelProvider supplies.
 * Kept in its own module so UI components can import the `useViewModel`
 * accessor without transitively pulling in the provider component (which the
 * composition root wires to concrete implementations). Default-less on
 * purpose: Solid 2's `useContext` throws `ContextNotFoundError` when no
 * provider is mounted above the read, and the `name` puts "ViewModel" in that
 * error's dev message. */
export const ViewModelContext = createContext<ViewModel>(undefined, {
  name: "ViewModel",
});
