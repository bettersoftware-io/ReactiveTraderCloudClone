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
  // Snapshot, unavoidably: Solid's own `createProvider` reads `props.value`
  // inside an `untrack` (solid.js, `createRenderEffect(() => res =
  // untrack(() => { ...[id]: props.value }))`), so this one JSX position is a
  // snapshot however it is written. Correct because every call site (AppRoot,
  // the contract render() helper, VisualScenario) mounts a fresh Provider
  // around a fresh ViewModel, never re-values a mounted one.
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
