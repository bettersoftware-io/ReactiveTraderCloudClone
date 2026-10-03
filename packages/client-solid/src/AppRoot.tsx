import type { JSX, ParentProps } from "solid-js";
import { untrack } from "solid-js";

import type { CoreFactory, CoreSelection } from "@rtc/core-api";
import {
  instrumentMachineFactories,
  instrumentPresenters,
} from "@rtc/devtools-core";
import { createViewModel, ViewModelProvider } from "@rtc/solid-bindings";

import { buildBrowserPorts, readDemoAccounts } from "#/app/buildBrowserPorts";
import { devtoolsHub } from "#/app/devtools/devtoolsHub";
import { PRESENTER_MANIFEST } from "#/app/devtools/presenterManifest";
import { AuthGate } from "#/ui/shell/auth/AuthGate";
import { BootGate } from "#/ui/shell/boot/BootGate";
import { PowerSaverRoot } from "#/ui/shell/power/PowerSaverRoot";
import { ThemeProvider } from "#/ui/shell/theme/ThemeProvider";

/** The app's composition root, as a component. Builds the presenters and the
 * ViewModel exactly once and supplies the whole provider stack (ViewModel +
 * theme + boot gate + auth gate) to the tree — the Solid counterpart of
 * client-react's AppRoot.tsx. Solid component setup functions run exactly
 * once per mount (there is no StrictMode-style double-invoke to guard
 * against), so — unlike the React version — this needs no lazy ref: a plain
 * top-level `createApp()` call at the top of the component body already
 * runs only once. ThemeProvider nests inside ViewModelProvider because it
 * reads the theme preference through the ViewModel seam.
 *
 * BootGate is always mounted; whether the splash overlay shows is the
 * BootGatePresenter's visible$ seam, seeded from the boot-splash decision in
 * `buildBrowserPorts()` → `createApp()`'s `BootGatePresenter` construction
 * (re-raised by the account menu's ⟳ Reboot HUD row). AuthGate nests inside
 * BootGate so the splash still plays over the login screen; it renders
 * LoginScreen until useAuth() reports "authenticated", then renders the app
 * (children). */
export function AppRoot(props: ParentProps<AppRootProps>): JSX.Element {
  // `core`/`coreSelection` never change after mount (the boot sequence in
  // main.tsx resolves both before the first render and a switch reloads the
  // whole page rather than re-valuing this component), so this snapshot —
  // read once via `untrack`, exactly like `ViewModelProvider`'s `props.value`
  // — is correct, not just a StrictMode-safe shortcut.
  const { core, coreSelection } = untrack(() => {
    return { core: props.core, coreSelection: props.coreSelection };
  });

  const { presenters, commands } = core.createApp(buildBrowserPorts());
  const instrumented = instrumentPresenters(
    presenters,
    PRESENTER_MANIFEST,
    devtoolsHub,
  );

  const viewModel = createViewModel(
    instrumented,
    instrumentMachineFactories(
      core.createMachineFactories(instrumented),
      devtoolsHub,
    ),
    commands,
    { coreSelection, demoAccounts: readDemoAccounts() },
  );

  return (
    <ViewModelProvider viewModel={viewModel}>
      <ThemeProvider>
        <PowerSaverRoot />
        <BootGate>
          <AuthGate>{props.children}</AuthGate>
        </BootGate>
      </ThemeProvider>
    </ViewModelProvider>
  );
}

interface AppRootProps {
  core: CoreFactory;
  coreSelection: CoreSelection;
}
