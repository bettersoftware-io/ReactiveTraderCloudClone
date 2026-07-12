import type { JSX, ParentProps } from "solid-js";

import { createApp, createMachineFactories } from "@rtc/client-core";
import { createViewModel, ViewModelProvider } from "@rtc/solid-bindings";

import { buildBrowserPorts } from "#/app/buildBrowserPorts";

/** The app's composition root, as a component. Builds the presenters and the
 * ViewModel exactly once and supplies the ViewModel to the tree — the Solid
 * counterpart of client-react's AppRoot.tsx. Solid component setup functions
 * run exactly once per mount (there is no StrictMode-style double-invoke to
 * guard against), so — unlike the React version — this needs no lazy ref: a
 * plain top-level `createApp()` call at the top of the component body already
 * runs only once. The boot-splash decision (`bootSplashGate.ts`) is seeded
 * transitively through `buildBrowserPorts()` → `createApp()`'s
 * `BootGatePresenter` construction, not here — this task's walking skeleton
 * has no BootGate/ThemeProvider UI yet (Phase 2). */
export function AppRoot(props: ParentProps): JSX.Element {
  const { presenters, commands } = createApp(buildBrowserPorts());
  const viewModel = createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );

  return (
    <ViewModelProvider viewModel={viewModel}>
      {props.children}
    </ViewModelProvider>
  );
}
