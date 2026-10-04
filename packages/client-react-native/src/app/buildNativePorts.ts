import Constants from "expo-constants";
import { tap } from "rxjs";

import {
  createSimulatorPorts,
  createWsRealPorts,
  HttpAuthAdapter,
  InMemorySessionStore,
  pairConnectionPorts,
  routeIdleLifecycle,
  WsAdapter,
  WsConnectionEventsAdapter,
  wsUrlToHttpBase,
} from "@rtc/client-adapters";
import type { AppPorts, SessionStore } from "@rtc/core-api";
import {
  AuthSimulator,
  type ConnectionEventsPort,
  ConnectionEventsSimulator,
  type PreferencesPort,
} from "@rtc/domain";

import { AppearanceColorSchemeAdapter } from "#/app/adapters/AppearanceColorSchemeAdapter";
import { AsyncStoragePreferencesAdapter } from "#/app/adapters/AsyncStoragePreferencesAdapter";
import { shouldPlayBootSplash } from "#/app/bootSplashGate";
import { DEV_CREDENTIALS } from "#/app/nativeAuthConfig";

interface BuildNativePortsOptions {
  simulator?: boolean;
  sessionStore?: SessionStore;
  /** Pre-hydrated preferences adapter, injected by the composition root so a
   * synchronous read (e.g. the boot variant at boot-machine construction) sees
   * the persisted value. Defaults to a self-hydrating adapter — fine for
   * Observable consumers, but its boot variant would race a cold-launch read.
   * See `AsyncStoragePreferencesAdapter.hydrate()` / `_layout.tsx`. */
  preferences?: PreferencesPort;
}

/** The assembled `AppPorts` plus a `dispose` that tears down any transport the
 * build owns. The real-WS branch constructs a `WsAdapter` with
 * `autoConnect: false`; `createApp`'s auth gate opens the socket once the user
 * authenticates (and closes it on sign-out). Once open, on unmount the raw
 * `WebSocket` must still be closed explicitly — otherwise it lingers and
 * reconnects forever via its internal timer, and each remount opens another.
 * `dispose` closes it (WsAdapter.dispose suppresses reconnect too); the
 * simulator branch has no socket, so its `dispose` is a no-op. */
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
 * `sessionStore` defaults to an `InMemorySessionStore` but is injected by the
 * composition root: `_layout.tsx` hydrates an `AsyncStorageSessionStore`
 * (`SessionStore` is synchronous, AsyncStorage is async — so it seeds an
 * in-memory mirror once at boot, before `AppRoot` mounts) and passes it here,
 * so a persisted session survives a cold launch. The real-WS branch drops the
 * old static `wsToken` query-param gate for genuine session auth: the
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
  const sessionStore = opts.sessionStore ?? new InMemorySessionStore();
  const preferences = opts.preferences ?? new AsyncStoragePreferencesAdapter();
  const colorScheme = new AppearanceColorSchemeAdapter();

  if (url) {
    const auth = new HttpAuthAdapter(wsUrlToHttpBase(url));
    // autoConnect: false — the socket is opened by createApp's auth gate once
    // the user is authenticated. Connecting here (at composition time) would
    // send a tokenless upgrade the server rejects, then retry it on a timer
    // behind the login screen.
    const ws = new WsAdapter(
      url,
      () => {
        return sessionStore.read()?.token;
      },
      { autoConnect: false },
    );
    const gateway = new WsConnectionEventsAdapter(ws);
    // Pairs THIS composition's own reconnect/incident intents with the
    // gateway events. `@rtc/core-api`'s `TransportPorts` omits
    // `connectionEvents` AND `connectionIntents` together (ADR-006
    // Follow-up 5), so `connectionIntents` below MUST be `paired`'s own —
    // supplying it apart from the events it feeds is a type error.
    const paired = pairConnectionPorts(gateway.events());
    const connectionEvents: ConnectionEventsPort = {
      events: () => {
        // The tap side-effects the transport:
        //   idleTimeout → closeForIdle()
        //   reconnect   → reopen()   (sole recovery; button-only)
        return paired.connectionEvents.events().pipe(
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
        connectionIntents: paired.connectionIntents,
        colorScheme,
        bootSplash: { shouldPlay: shouldPlayBootSplash },
        transport: ws,
      },
      dispose: () => {
        ws.dispose();
      },
    };
  }

  const gateway = new ConnectionEventsSimulator();
  const auth = new AuthSimulator(DEV_CREDENTIALS);
  return {
    ports: {
      ...createSimulatorPorts({ preferences, auth, sessionStore }),
      // Rendered "connected-only" — unlike the web simulator branches, the
      // RN simulator's reconnect handling has never passed the raw intent
      // through, only the synthesized `gatewayConnected` that resumes the
      // state machine after an idle close (a no-op with no real socket);
      // kept exactly as it already behaved (see `ReconnectRendering`'s doc).
      ...pairConnectionPorts(gateway.events(), {
        reconnectRendering: "connected-only",
      }),
      colorScheme,
      bootSplash: { shouldPlay: shouldPlayBootSplash },
    },
    dispose: () => {},
  };
}
