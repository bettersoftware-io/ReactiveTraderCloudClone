import type { ReactElement, ReactNode } from "react";

import { useViewModel } from "@rtc/react-bindings";

import { LoginScreen } from "./LoginScreen";

/**
 * Gates the app behind the auth lifecycle: while `useAuth().state.status` is
 * not `"authenticated"` (i.e. `"unauthenticated"` or `"authenticating"`), it
 * renders the full-screen `LoginScreen` instead of `children`. Once
 * authenticated, `children` (the app) renders; `LockScreen` is not rendered
 * here — it stays mounted inside `App` and self-hides unless locked, so an
 * authenticated-but-locked session still shows the app underneath its
 * overlay. Dumb component: all state arrives through the `useAuth` seam.
 */
export function AuthGate({ children }: AuthGateProps): ReactElement {
  const { useAuth } = useViewModel();
  const { state } = useAuth();

  if (state.status !== "authenticated") {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

interface AuthGateProps {
  children: ReactNode;
}
