import { type ReactElement, type ReactNode, useRef } from "react";

import { createApp, createMachineFactories } from "./app/composition";
import { shouldPlayBootSplash } from "./bootSplashGate";
import { createViewModel, type ViewModel } from "./ui/hooks/createViewModel";
import { ViewModelProvider } from "./ui/hooks/ViewModelProvider";
import { BootGate } from "./ui/shell/boot/BootGate";
import { ThemeProvider } from "./ui/shell/theme/ThemeProvider";

interface AppRootProps {
  children: ReactNode;
}

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
    const { presenters, commands } = createApp();
    viewModelRef.current = createViewModel(
      presenters,
      createMachineFactories(presenters),
      commands,
    );
  }

  return (
    <ViewModelProvider viewModel={viewModelRef.current}>
      <ThemeProvider>
        {shouldPlayBootSplash() ? (
          <BootGate>{children}</BootGate>
        ) : (
          <>{children}</>
        )}
      </ThemeProvider>
    </ViewModelProvider>
  );
}
