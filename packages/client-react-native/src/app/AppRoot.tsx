import { type ReactElement, type ReactNode, useRef } from "react";

import { createApp, createMachineFactories } from "@rtc/client-core";
import {
  createViewModel,
  type ViewModel,
  ViewModelProvider,
} from "@rtc/react-bindings";

import { buildNativePorts } from "#/app/buildNativePorts";

interface AppRootProps {
  simulator: boolean;
  children: ReactNode;
}

/** The RN app's composition root, as a component. Builds the presenters and the
 * ViewModel exactly once for this mount and supplies the ViewModelProvider to
 * the tree — the analogue of client-react's `AppRoot`, minus the web shell
 * (ThemeProvider / BootGate / boot-splash gate).
 *
 * The build runs in a lazy ref, not useState/useMemo: React StrictMode
 * double-invokes the render body (and state/memo initializers) in dev to
 * surface impurity, which would construct — and discard — a second App with its
 * own presenters and transport wiring. A ref cell is shared across both
 * invocations of the mount, so `createApp()` runs exactly once.
 *
 * The `simulator` prop is fixed per mount; Task 6's demo toggle re-mounts this
 * component with a React `key` to switch branches — no branch-switching logic
 * lives here. */
export function AppRoot({ simulator, children }: AppRootProps): ReactElement {
  const viewModelRef = useRef<ViewModel | null>(null);

  if (viewModelRef.current === null) {
    const { presenters, commands } = createApp(buildNativePorts({ simulator }));
    viewModelRef.current = createViewModel(
      presenters,
      createMachineFactories(presenters),
      commands,
    );
  }

  return (
    <ViewModelProvider viewModel={viewModelRef.current}>
      {children}
    </ViewModelProvider>
  );
}
