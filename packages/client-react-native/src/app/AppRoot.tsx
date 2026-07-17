import Constants from "expo-constants";
import { type ReactElement, type ReactNode, useEffect, useRef } from "react";

import { createApp } from "@rtc/client-core";
import {
  createViewModel,
  type ViewModel,
  ViewModelProvider,
} from "@rtc/react-bindings";

import { buildNativePorts } from "#/app/buildNativePorts";
import {
  buildViewModelInputs,
  type NativeDevtools,
} from "#/app/devtools/buildViewModelInputs";
import { createNativeDevtoolsHub } from "#/app/devtools/nativeDevtoolsHub";
import { NATIVE_PRESENTER_MANIFEST } from "#/app/devtools/presenterManifest";
import { resolveRelayUrl } from "#/app/devtools/resolveRelayUrl";

/** The RN app's composition root, as a component. Builds the presenters and the
 * ViewModel exactly once for this mount and supplies the ViewModelProvider to
 * the tree — the analogue of client-react's `AppRoot`, minus the web shell
 * (ThemeProvider / BootGate / boot-splash gate).
 *
 * RN now has a login UI (`AuthGate` + `LoginScreen`, wired in `_layout.tsx`)
 * gating the app until the operator authenticates — no baked auto-login here.
 * `LockScreen`'s AUTHENTICATE control re-auths with a typed password (the
 * real credentials seam via `useAuth().unlock`) to clear the lock — no baked
 * credential involved. `nativeAuthConfig.ts` now only supplies simulator-mode
 * dev credentials to `buildNativePorts`, never consumed directly by UI.
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

    const devtools = createNativeDevtools();
    const inputs = buildViewModelInputs(presenters, devtools);
    const viewModel = createViewModel(
      inputs.presenters,
      inputs.factories,
      commands,
    );

    ref.current = {
      viewModel,
      dispose: (): void => {
        devtools?.hub.dispose();
        dispose();
      },
    };
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

interface AppRootProps {
  simulator: boolean;
  children: ReactNode;
}

interface Composition {
  viewModel: ViewModel;
  dispose: () => void;
}

/** Dev-only devtools wiring. In a production RN build (`__DEV__` false) this is
 * null — no decorators, no relay socket, dormant-and-disconnected by
 * construction. Wrapped in try/catch because the tap must never break app boot:
 * if the relay transport can't be constructed (e.g. no global WebSocket), the
 * app ships without devtools rather than crashing. */
function createNativeDevtools(): NativeDevtools | null {
  if (!__DEV__) {
    return null;
  }

  try {
    return {
      hub: createNativeDevtoolsHub(
        resolveRelayUrl(Constants.expoConfig?.hostUri),
      ),
      manifest: NATIVE_PRESENTER_MANIFEST,
    };
  } catch {
    return null;
  }
}
