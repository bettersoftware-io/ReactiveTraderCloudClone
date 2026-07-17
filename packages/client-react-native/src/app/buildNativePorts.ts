import Constants from "expo-constants";
import { merge, mergeMap, of, tap } from "rxjs";

import {
  type AppPorts,
  createSimulatorPorts,
  createWsRealPorts,
  HttpAuthAdapter,
  InMemorySessionStore,
  incident$,
  reconnect$,
  routeIdleLifecycle,
  WsAdapter,
  WsConnectionEventsAdapter,
  wsUrlToHttpBase,
} from "@rtc/client-core";
import {
  AuthSimulator,
  type ConnectionEventsPort,
  ConnectionEventsSimulator,
} from "@rtc/domain";

import { AppearanceColorSchemeAdapter } from "#/app/adapters/AppearanceColorSchemeAdapter";
import { AsyncStoragePreferencesAdapter } from "#/app/adapters/AsyncStoragePreferencesAdapter";
import { DEV_CREDENTIALS } from "#/app/nativeAuthConfig";

interface BuildNativePortsOptions {
  simulator?: boolean;
}

/** The assembled `AppPorts` plus a `dispose` that tears down any transport the
 * build owns. The real-WS branch constructs a `WsAdapter` that opens its socket
 * eagerly in the constructor (not on Rx subscribe), so on unmount the raw
 * `WebSocket` must be closed explicitly — otherwise it lingers and reconnects
 * forever via its internal timer, and each remount opens another. `dispose`
 * closes it (WsAdapter.dispose suppresses reconnect too); the simulator branch
 * has no socket, so its `dispose` is a no-op. */
export interface NativeComposition {
  ports: AppPorts;
  dispose: () => void;
}

/** The RN analogue of `buildBrowserPorts` (client-react): assembles the
 * `AppPorts` that `createApp` composes into presenters. Two branches selected
 * by the WS URL — a real WebSocket stack when `extra.serverUrl` is set, else a
 * fully in-process simulator stack. There is no DOM here, so the browser
 * connectivity source is dropped; `colorScheme` is supplied by an
 * `Appearance`-backed adapter so "system" mode follows the device setting.
 *
 * `sessionStore` is an `InMemorySessionStore` (not AsyncStorage-backed):
 * `SessionStore` is synchronous but AsyncStorage is async, and RN shows a
 * login screen on every launch (`AppRoot` + `AuthGate`) rather than persisting
 * a session — so AsyncStorage-backed persistence would be redundant work for
 * no benefit today (a future follow-up). The real-WS branch drops
 * the old static `wsToken` query-param gate for genuine session auth: the
 * `WsAdapter` now reads its token fresh from `sessionStore` on every
 * (re)connect, matching `buildBrowserPorts`.
 *
 * The `simulator` option forces the simulator branch regardless of config — the
 * demo toggle (Task 6) drives it. */
export function buildNativePorts(
  opts: BuildNativePortsOptions = {},
): NativeComposition {
  const extra = Constants.expoConfig?.extra ?? {};
  const url = opts.simulator
    ? undefined
    : (extra.serverUrl as string | undefined);
  const sessionStore = new InMemorySessionStore();
  const preferences = new AsyncStoragePreferencesAdapter();
  const colorScheme = new AppearanceColorSchemeAdapter();

  if (url) {
    const auth = new HttpAuthAdapter(wsUrlToHttpBase(url));
    const ws = new WsAdapter(url, () => {
      return sessionStore.read()?.token;
    });
    const gateway = new WsConnectionEventsAdapter(ws);
    const connectionEvents: ConnectionEventsPort = {
      events: () => {
        // Merge gateway events with user-initiated reconnect intents and
        // incident injections. The tap side-effects the transport:
        //   idleTimeout → closeForIdle()
        //   reconnect   → reopen()   (sole recovery; button-only)
        return merge(gateway.events(), reconnect$, incident$).pipe(
          tap((e) => {
            return routeIdleLifecycle(e, ws);
          }),
        );
      },
    };
    return {
      ports: {
        ...createWsRealPorts(ws, { preferences, auth, sessionStore }),
        connectionEvents,
        colorScheme,
      },
      dispose: () => {
        ws.dispose();
      },
    };
  }

  const gateway = new ConnectionEventsSimulator();
  const connectionEvents: ConnectionEventsPort = {
    events: () => {
      // Simulator branch: the ConnectionEventsSimulator emits gatewayConnected
      // so the connection presenter advances past CONNECTING. reconnect$ resumes
      // the state machine after an idle close (a no-op with no real socket).
      return merge(
        gateway.events(),
        reconnect$.pipe(
          mergeMap(() => {
            return of({ type: "gatewayConnected" as const });
          }),
        ),
        incident$,
      );
    },
  };
  const auth = new AuthSimulator(DEV_CREDENTIALS);
  return {
    ports: {
      ...createSimulatorPorts({ preferences, auth, sessionStore }),
      connectionEvents,
      colorScheme,
    },
    dispose: () => {},
  };
}
