import { type JSX, type ParentProps, untrack } from "solid-js";

import { createViewModel, ViewModelProvider } from "@rtc/solid-bindings";
import type { Composition } from "@rtc/web-boot";

import { readDemoAccounts } from "#/app/buildBrowserPorts";
import { AuthGate } from "#/ui/shell/auth/AuthGate";
import { BootGate } from "#/ui/shell/boot/BootGate";
import { PowerSaverRoot } from "#/ui/shell/power/PowerSaverRoot";
import { ThemeProvider } from "#/ui/shell/theme/ThemeProvider";

/** The UI root of one composition — the Solid counterpart of client-react's
 * AppRoot.tsx. The core host (`app/coreHost.ts`) owns the ports and composes
 * the core, once per composition, outside Solid, and renders this component
 * with the result; a core swap disposes the tree and renders a fresh one.
 * This component only builds the ViewModel from the composition and supplies
 * the whole provider stack (ViewModel + theme + boot gate + auth gate) to the
 * tree. ThemeProvider nests inside ViewModelProvider because it reads the
 * theme preference through the ViewModel seam.
 *
 * BootGate is always mounted; whether the splash overlay shows is the
 * BootGatePresenter's visible$ seam, seeded from the boot-splash decision in
 * `buildBrowserPorts()` (asked once per page by the host), re-raised by the
 * account menu's ⟳ Reboot HUD row. AuthGate nests inside BootGate so the
 * splash still plays over the login screen; it renders LoginScreen until
 * useAuth() reports "authenticated", then renders the app (children). */
export function AppRoot(props: ParentProps<AppRootProps>): JSX.Element {
  // `composition` never changes within one mount: a swap renders a new tree
  // rather than re-valuing this component, so this snapshot — read once via
  // `untrack`, exactly like `ViewModelProvider`'s `props.value` — is correct.
  const composition = untrack(() => {
    return props.composition;
  });

  const viewModel = createViewModel(
    composition.presenters,
    composition.machineFactories,
    composition.commands,
    {
      coreSelection: composition.coreSelection,
      demoAccounts: readDemoAccounts(),
      takePreferencesReopen: () => {
        return composition.takePreferencesReopen();
      },
      peekPreferencesReopen: () => {
        return composition.peekPreferencesReopen();
      },
    },
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
  composition: Composition;
}
