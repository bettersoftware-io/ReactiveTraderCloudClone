import type { JSX, ParentProps } from "solid-js";
import { Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { LoginScreen } from "./LoginScreen";

/**
 * Gates the app behind the auth lifecycle: while `useAuth().state().status`
 * is not "authenticated" (i.e. "unauthenticated" or "authenticating"),
 * renders the full-screen LoginScreen instead of children. Once
 * authenticated, children (the app) render. LockScreen is NOT rendered here —
 * it stays mounted inside App and self-hides unless locked, so an
 * authenticated-but-locked session still shows the app under its overlay.
 * Dumb component: all state arrives through the `useAuth` seam.
 */
export function AuthGate(props: ParentProps): JSX.Element {
  const { useAuth } = useViewModel();
  const { state } = useAuth();

  return (
    <Show when={state().status === "authenticated"} fallback={<LoginScreen />}>
      {props.children}
    </Show>
  );
}
