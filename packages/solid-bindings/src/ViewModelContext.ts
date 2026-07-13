import { createContext } from "solid-js";

import type { ViewModel } from "#/createViewModel";

/** The DI seam's context: holds the ViewModel (or undefined until a
 * ViewModelProvider supplies it). Kept in its own module so UI components can
 * import the `useViewModel` accessor without transitively pulling in the
 * provider component (which the composition root wires to concrete
 * implementations). Solid's `createContext` has no built-in default-value
 * parameter overload that stays `undefined`-typed, so it's called with no
 * argument: the inferred default is `undefined`, and `useViewModel` narrows it. */
export const ViewModelContext = createContext<ViewModel>();
