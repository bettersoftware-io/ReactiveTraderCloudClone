import { Cause, Effect, Scope } from "effect";

import type { AuthGatedTransport, AuthViewState, Stream } from "@rtc/core-api";

import { type EffectHost, listenToStream, reportOutOfBand } from "#/bridge/out";

/** Open `transport` when `authState$` becomes authenticated and close it when
 * it stops being so — once per edge, the first state included (a signed-out
 * start calls `disconnect()`, idempotent on a socket that never opened). The
 * twin of the RxJS core's `gateTransportOnAuth`, over THIS core's own `auth`:
 * the base app's gate watches the base's `auth`, which a native login never
 * reaches. Held until `host`'s scope closes. No `transport` (the simulator
 * branch) leaves nothing to gate. */
export function gateTransportOnAuth(
  host: EffectHost,
  transport: AuthGatedTransport | undefined,
  authState$: Stream<AuthViewState>,
): void {
  if (transport === undefined) {
    return;
  }

  let wasAuthenticated: boolean | undefined;
  const release = listenToStream(
    authState$,
    (state) => {
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
    (error: unknown) => {
      reportOutOfBand(Cause.die(error));
    },
  );
  host.runtime.runSync(Scope.addFinalizer(host.scope, Effect.sync(release)));
}
