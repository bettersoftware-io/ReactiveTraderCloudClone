import { Cause, Effect, Scope } from "effect";

import type { AuthGatedTransport, AuthViewState, Stream } from "@rtc/core-api";

import { type EffectHost, listenToStream, reportOutOfBand } from "#/bridge/out";

/** Open `transport` when `authState$` becomes authenticated and close it when
 * it stops being so — once per edge, the first state included (a signed-out
 * start calls `disconnect()`, idempotent on a socket that never opened). The
 * twin of the RxJS core's `gateTransportOnAuth`, over THIS core's own `auth`.
 * Held until `host`'s scope closes. No `transport` (the simulator
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

/** Sign `auth` out each time `transport` reports the server ended the
 * session (`sessionEnded()`, a 4401 close). Subscribed ONCE, here, at
 * construction, and held until `host`'s scope closes. No `transport` (the
 * simulator branch) means no session can end, and nothing is subscribed. A
 * throw from `endSession` is not caught (the listener calls it directly, as
 * the RxJS core's subscriber does); a failing source is reported out of
 * band. */
export function relaySessionEndToAuth(
  host: EffectHost,
  transport: AuthGatedTransport | undefined,
  auth: SessionEndingAuth,
): void {
  if (transport === undefined) {
    return;
  }

  const release = listenToStream(
    transport.sessionEnded(),
    () => {
      auth.endSession();
    },
    (error: unknown) => {
      reportOutOfBand(Cause.die(error));
    },
  );
  host.runtime.runSync(Scope.addFinalizer(host.scope, Effect.sync(release)));
}

/** What `relaySessionEndToAuth` needs of the auth presenter: its internal
 * sign-out for a session the server ended. */
interface SessionEndingAuth {
  endSession(): void;
}
