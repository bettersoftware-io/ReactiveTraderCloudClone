import { type ReactElement, type ReactNode, useEffect, useRef } from "react";

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

interface Composition {
  viewModel: ViewModel;
  dispose: () => void;
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
 * invocations of the mount, so `createApp()` runs exactly once. Children need
 * the ViewModel on first render, so the build stays in render (not the effect);
 * the effect owns teardown only.
 *
 * StrictMode-safe teardown (mirrors react-bindings `useMachine`): the real-WS
 * `buildNativePorts` branch owns a `WsAdapter` whose socket opens eagerly in the
 * constructor, so unmount must call `composition.dispose()` (closes the socket +
 * suppresses reconnect). But StrictMode runs the mount-time effect cycle
 * setup -> cleanup -> setup synchronously within the commit; the composition
 * lives in a lazy ref (built once), so a cleanup that disposed eagerly would
 * kill the very socket the immediate re-setup keeps using. We DEFER disposal to
 * a microtask, scheduled in cleanup and cancelled by an immediate re-setup: the
 * StrictMode remount cancels the pending disposal (socket survives), while a
 * REAL unmount (no following setup) lets the microtask dispose exactly once. The
 * `key`-remount demo toggle is a real unmount->mount of a NEW element, so the
 * dispose fires there as intended; the deferred pattern only guards the
 * StrictMode same-mount double-invoke. A microtask suffices because that
 * double-invoke is synchronous within the commit, always before the microtask.
 *
 * The `simulator` prop is fixed per mount; Task 6's demo toggle re-mounts this
 * component with a React `key` to switch branches — no branch-switching logic
 * lives here. */
export function AppRoot({ simulator, children }: AppRootProps): ReactElement {
  const ref = useRef<Composition | null>(null);

  if (ref.current === null) {
    const { ports, dispose } = buildNativePorts({ simulator });
    const { presenters, commands } = createApp(ports);
    const viewModel = createViewModel(
      presenters,
      createMachineFactories(presenters),
      commands,
    );
    ref.current = { viewModel, dispose };
  }

  const keepAlive = useRef(true);
  useEffect(() => {
    keepAlive.current = true; // a re-setup (StrictMode remount) cancels a pending disposal

    return (): void => {
      keepAlive.current = false;
      queueMicrotask(() => {
        if (!keepAlive.current) {
          ref.current?.dispose();
          ref.current = null;
        }
      });
    };
  }, []);

  return (
    <ViewModelProvider viewModel={ref.current.viewModel}>
      {children}
    </ViewModelProvider>
  );
}
