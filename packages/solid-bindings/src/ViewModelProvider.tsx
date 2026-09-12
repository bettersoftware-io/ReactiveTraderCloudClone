import type { JSX } from "solid-js";
import { untrack } from "solid-js";

import type { ViewModel } from "#/createViewModel";
import { ViewModelContext } from "#/ViewModelContext";

interface ViewModelProviderProps {
  viewModel: ViewModel;
  children: JSX.Element;
}

/** Composition-root component: supplies the concrete ViewModel to the
 * tree. Only the app entrypoint (and test harnesses) import this; UI
 * components read the seam via `useViewModel` so they never depend on the
 * wiring. Props are read via `props.viewModel`/`props.children` (never
 * destructured in the parameter list or the body) — Solid props are
 * reactive getters backed by a proxy, and destructuring would snapshot the
 * value once instead of tracking it. */
export function ViewModelProvider(props: ViewModelProviderProps): JSX.Element {
  // `untrack` is not belt-and-braces here, it is the truth: Solid's own
  // `createProvider` reads `props.value` inside an `untrack` (solid.js,
  // `createRenderEffect(() => res = untrack(() => { ...[id]: props.value }))`),
  // so this one JSX position is a snapshot no matter how it is written. Saying
  // so at the call site beats a directive claiming it.
  return (
    <ViewModelContext.Provider
      value={untrack((): ViewModel => {
        return props.viewModel;
      })}
    >
      {props.children}
    </ViewModelContext.Provider>
  );
}
