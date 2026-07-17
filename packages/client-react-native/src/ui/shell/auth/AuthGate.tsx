import type { JSX, ReactNode } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { LoginScreen } from "#/ui/shell/auth/LoginScreen";

/** Gates the app behind the auth lifecycle: while `useAuth().state.status` is
 * not `"authenticated"` (i.e. `"unauthenticated"` or `"authenticating"`), it
 * renders the full-screen `LoginScreen` instead of `children`. Once
 * authenticated, `children` (the app) renders; `LockScreen` is not rendered
 * here — it stays mounted inside `Chrome` and self-hides unless locked, so an
 * authenticated-but-locked session still shows the app underneath its
 * overlay. Dumb component: all state arrives through the `useAuth` seam.
 * `simulator`/`onToggleSimulator` are forwarded verbatim to `LoginScreen` so
 * the Sim/Live toggle is reachable pre-auth — a fresh live-mode boot against
 * a sleeping or credential-less server would otherwise strand the operator
 * on a login form with no way to switch to simulator mode. */
export function AuthGate({
  children,
  simulator,
  onToggleSimulator,
}: AuthGateProps): JSX.Element {
  const { useAuth } = useViewModel();
  const { state } = useAuth();

  if (state.status !== "authenticated") {
    return (
      <LoginScreen
        simulator={simulator}
        onToggleSimulator={onToggleSimulator}
      />
    );
  }

  return <>{children}</>;
}

interface AuthGateProps {
  children: ReactNode;
  simulator: boolean;
  onToggleSimulator: (value: boolean) => void;
}
