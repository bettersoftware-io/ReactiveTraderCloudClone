import type { AuthGatedTransport, AuthViewState, Stream } from "@rtc/core-api";

/** Open `transport` when `authState$` becomes authenticated and close it when
 * it stops being so — once per edge, the first state included (a signed-out
 * start calls `disconnect()`, idempotent on a socket that never opened). The
 * twin of the RxJS core's `gateTransportOnAuth`, over THIS core's own `auth`.
 * Held until `lifetime` aborts. No `transport` (the simulator
 * branch) leaves nothing to gate. */
export function gateTransportOnAuth(
  transport: AuthGatedTransport | undefined,
  authState$: Stream<AuthViewState>,
  lifetime: AbortSignal,
): void {
  if (transport === undefined) {
    return;
  }

  let wasAuthenticated: boolean | undefined;
  const subscription = authState$.subscribe({
    next: (state: AuthViewState) => {
      const isAuthenticated = state.status === "authenticated";

      if (isAuthenticated === wasAuthenticated) {
        return;
      }

      wasAuthenticated = isAuthenticated;

      if (isAuthenticated) {
        transport.connect();
      } else {
        transport.disconnect();
      }
    },
    // A failing `auth` stream is a bug, not a state: surface it out of band,
    // as the Effect twin and the RxJS reference (unhandled) both do.
    error: (error: unknown) => {
      setTimeout(() => {
        throw error;
      }, 0);
    },
  });
  lifetime.addEventListener(
    "abort",
    () => {
      subscription.unsubscribe();
    },
    { once: true },
  );
}
