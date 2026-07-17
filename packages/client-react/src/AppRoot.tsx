import { type ReactElement, type ReactNode, useRef } from "react";

import { createApp, createMachineFactories } from "@rtc/client-core";
import {
  instrumentMachineFactories,
  instrumentPresenters,
} from "@rtc/devtools-core";
import {
  createViewModel,
  type ViewModel,
  ViewModelProvider,
} from "@rtc/react-bindings";

import { buildBrowserPorts } from "#/app/buildBrowserPorts";
import { devtoolsHub } from "#/app/devtools/devtoolsHub";
import { PRESENTER_MANIFEST } from "#/app/devtools/presenterManifest";

import { AuthGate } from "./ui/shell/auth/AuthGate";
import { BootGate } from "./ui/shell/boot/BootGate";
import { PowerSaverRoot } from "./ui/shell/power/PowerSaverRoot";
import { ThemeProvider } from "./ui/shell/theme/ThemeProvider";

/** The app's composition root, as a component. Builds the presenters and the
 * ViewModel exactly once and supplies the whole provider stack (ViewModel +
 * theme) to the tree — replacing the module-level singletons that used to live
 * in main.tsx, so the wiring's lifetime is owned by this component rather than
 * module load (which makes it straightforward to host multiple/independent
 * roots in tests). ThemeProvider nests inside ViewModelProvider because it reads
 * the theme preference through the ViewModel seam.
 *
 * The build runs in a lazy ref, not useState/useMemo: React StrictMode
 * double-invokes the render body (and state/memo initializers) in dev to
 * surface impurity, which would construct — and discard — a second App with its
 * own presenters and transport wiring. A ref cell is shared across both
 * invocations of the mount, so `createApp()` runs exactly once. */
export function AppRoot({ children }: AppRootProps): ReactElement {
  const viewModelRef = useRef<ViewModel | null>(null);

  if (viewModelRef.current === null) {
    const { presenters, commands } = createApp(buildBrowserPorts());
    const instrumented = instrumentPresenters(
      presenters,
      PRESENTER_MANIFEST,
      devtoolsHub,
    );
    viewModelRef.current = createViewModel(
      instrumented,
      instrumentMachineFactories(
        createMachineFactories(instrumented),
        devtoolsHub,
      ),
      commands,
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
  children: ReactNode;
}
