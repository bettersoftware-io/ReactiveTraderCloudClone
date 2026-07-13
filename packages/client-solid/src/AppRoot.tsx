import type { JSX, ParentProps } from "solid-js";

import { createApp, createMachineFactories } from "@rtc/client-core";
import { createViewModel, ViewModelProvider } from "@rtc/solid-bindings";

import { buildBrowserPorts } from "#/app/buildBrowserPorts";
import { BootGate } from "#/ui/shell/boot/BootGate";
import { ThemeProvider } from "#/ui/shell/theme/ThemeProvider";

/** The app's composition root, as a component. Builds the presenters and the
 * ViewModel exactly once and supplies the whole provider stack (ViewModel +
 * theme + boot gate) to the tree — the Solid counterpart of client-react's
 * AppRoot.tsx. Solid component setup functions run exactly once per mount
 * (there is no StrictMode-style double-invoke to guard against), so —
 * unlike the React version — this needs no lazy ref: a plain top-level
 * `createApp()` call at the top of the component body already runs only
 * once. ThemeProvider nests inside ViewModelProvider because it reads the
 * theme preference through the ViewModel seam.
 *
 * BootGate is always mounted; whether the splash overlay shows is the
 * BootGatePresenter's visible$ seam, seeded from the boot-splash decision in
 * `buildBrowserPorts()` → `createApp()`'s `BootGatePresenter` construction
 * (re-raised by the account menu's ⟳ Reboot HUD row). */
export function AppRoot(props: ParentProps): JSX.Element {
  const { presenters, commands } = createApp(buildBrowserPorts());
  const viewModel = createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );

  return (
    <ViewModelProvider viewModel={viewModel}>
      <ThemeProvider>
        <BootGate>{props.children}</BootGate>
      </ThemeProvider>
    </ViewModelProvider>
  );
}
