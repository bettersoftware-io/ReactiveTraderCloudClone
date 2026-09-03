import type { JSX } from "solid-js";

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
  return (
    // eslint-disable-next-line solid/reactivity -- Solid's Context.Provider reads its `value` prop exactly once, at creation (a documented Solid quirk, the one JSX position that is NOT reactive despite `props.viewModel` being a tracked getter, per the doc comment above); safe here because every call site (AppRoot, the contract-test render() helper, VisualScenario) constructs a fresh ViewModel and mounts a fresh ViewModelProvider around it — none re-renders an already-mounted Provider with a changed `viewModel` prop
    <ViewModelContext.Provider value={props.viewModel}>
      {props.children}
    </ViewModelContext.Provider>
  );
}
