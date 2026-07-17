import type { JSX, ParentProps } from "solid-js";
import { onMount } from "solid-js";

import { createApp, createMachineFactories } from "@rtc/client-core";
import { createViewModel, ViewModelProvider } from "@rtc/solid-bindings";

import { buildBrowserPorts } from "#/app/buildBrowserPorts";
import { BootGate } from "#/ui/shell/boot/BootGate";
import { PowerSaverRoot } from "#/ui/shell/power/PowerSaverRoot";
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
 * (re-raised by the account menu's ⟳ Reboot HUD row).
 *
 * Skeleton auto-login: this walking skeleton has no login UI yet (that's
 * `client-react`'s `AuthGate`/`LoginScreen` — Solid parity is future work),
 * so it logs in as the baked demo/demo operator on mount instead of gating
 * the tree behind a real sign-in screen. `presenters.auth.login` is
 * idempotent enough for this purpose (a fresh `InMemorySessionStore` per
 * load means there's never an already-authenticated session to clobber). */
export function AppRoot(props: ParentProps): JSX.Element {
  const { presenters, commands } = createApp(buildBrowserPorts());
  const viewModel = createViewModel(
    presenters,
    createMachineFactories(presenters),
    commands,
  );

  onMount(() => {
    presenters.auth.login("demo", "demo");
  });

  return (
    <ViewModelProvider viewModel={viewModel}>
      <ThemeProvider>
        <PowerSaverRoot />
        <BootGate>{props.children}</BootGate>
      </ThemeProvider>
    </ViewModelProvider>
  );
}
