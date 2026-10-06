import { type ReactElement, type ReactNode, useRef } from "react";

import {
  createViewModel,
  type ViewModel,
  ViewModelProvider,
} from "@rtc/react-bindings";
import type { Composition } from "@rtc/web-boot";

import { readDemoAccounts } from "#/app/buildBrowserPorts";

import { AuthGate } from "./ui/shell/auth/AuthGate";
import { BootGate } from "./ui/shell/boot/BootGate";
import { PowerSaverRoot } from "./ui/shell/power/PowerSaverRoot";
import { ThemeProvider } from "./ui/shell/theme/ThemeProvider";

/** The UI root of one composition. The core host (`app/coreHost.ts`) owns
 * the ports and composes the core — exactly once per composition, outside
 * React — and mounts this component with the result; a core swap unmounts it
 * and mounts a fresh one (keyed by `composition.generation`). This component
 * only builds the ViewModel from the composition and supplies the whole
 * provider stack (ViewModel + theme) to the tree. ThemeProvider nests inside
 * ViewModelProvider because it reads the theme preference through the
 * ViewModel seam.
 *
 * The ViewModel is built in a lazy ref, not useState/useMemo: React
 * StrictMode double-invokes the render body (and state/memo initializers) in
 * dev, which would bind — and discard — a second ViewModel over the same
 * presenters. A ref cell is shared across both invocations of the mount, so
 * `createViewModel()` runs exactly once per mount. */
export function AppRoot({ composition, children }: AppRootProps): ReactElement {
  const viewModelRef = useRef<ViewModel | null>(null);

  if (viewModelRef.current === null) {
    viewModelRef.current = createViewModel(
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
  }

  // BootGate is always mounted; whether the splash overlay shows is the
  // BootGatePresenter's visible$ seam (seeded from the boot-splash decision in
  // buildBrowserPorts, re-raised by the account menu's ⟳ Reboot HUD row).
  // AuthGate nests inside BootGate so the splash still plays over the login
  // screen; it renders LoginScreen until useAuth() reports "authenticated",
  // then renders the app (children).
  return (
    <ViewModelProvider viewModel={viewModelRef.current}>
      <ThemeProvider>
        <PowerSaverRoot />
        <BootGate>
          <AuthGate>{children}</AuthGate>
        </BootGate>
      </ThemeProvider>
    </ViewModelProvider>
  );
}

interface AppRootProps {
  composition: Composition;
  children: ReactNode;
}
