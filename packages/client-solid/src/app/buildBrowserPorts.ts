import { merge, mergeMap, of, tap } from "rxjs";

import {
  type AppPorts,
  createSimulatorPorts,
  createWsRealPorts,
  HttpAuthAdapter,
  incident$,
  reconnect$,
  routeIdleLifecycle,
  WsAdapter,
  WsConnectionEventsAdapter,
  wsUrlToHttpBase,
} from "@rtc/client-core";
import { instrumentWsAdapter } from "@rtc/devtools-core";
import {
  AuthSimulator,
  type ConnectionEventsPort,
  ConnectionEventsSimulator,
} from "@rtc/domain";

import { BrowserConnectionEventsAdapter } from "#/app/adapters/BrowserConnectionEventsAdapter";
import { LocalStoragePreferencesAdapter } from "#/app/adapters/LocalStoragePreferencesAdapter";
import { LocalStorageSessionStore } from "#/app/adapters/LocalStorageSessionStore";
import { devtoolsHub } from "#/app/devtools/devtoolsHub";
import { MediaQueryColorSchemeAdapter } from "#/app/theme/MediaQueryColorSchemeAdapter";
import { shouldPlayBootSplash } from "#/bootSplashGate";

export function buildBrowserPorts(): AppPorts {
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const browser = new BrowserConnectionEventsAdapter();
  const preferences = new LocalStoragePreferencesAdapter();
  // localStorage-backed session store (parity with client-react): the AuthGate
  // sign-in persists under the shared `rtc-session` key, so the session
  // survives a reload — and the browser e2e suites can boot straight past the
  // login screen by seeding that same key (tests/browser/authSeed.ts). An
  // in-memory store would ignore that seed and strand every e2e on LoginScreen.
  const sessionStore = new LocalStorageSessionStore();
  const colorScheme = new MediaQueryColorSchemeAdapter();
  // One-shot boot-splash decision (webdriver/nosplash suppress it) — read at
  // composition time to seed the BootGatePresenter.
  const bootSplash = { shouldPlay: shouldPlayBootSplash };

  if (url) {
    const auth = new HttpAuthAdapter(wsUrlToHttpBase(url));
    // Wrap the transport in the devtools wire tap at construction so every
    // send/on/rpc is mirrored to the hub (dormant until an inspector attaches).
    // The simulator branch below has no adapter — its wire panel is simply empty.
    const ws = instrumentWsAdapter(
      new WsAdapter(url, () => {
        return sessionStore.read()?.token;
      }),
      devtoolsHub,
    );
    const gateway = new WsConnectionEventsAdapter(ws);
    const connectionEvents: ConnectionEventsPort = {
      events: () => {
        // Merge gateway events, browser lifecycle events, and user-initiated
        // reconnect intents. The tap side-effects the transport:
        //   idleTimeout → closeForIdle()
        //   reconnect   → reopen()       (sole recovery; button-only)
        //   userActivity → no-op here    (resets countdown in BrowserAdapter)
        // Provenance: original services/connection.ts:74-96.
        return merge(
          gateway.events(),
          browser.events(),
          reconnect$,
          incident$,
        ).pipe(
          tap((e) => {
            return routeIdleLifecycle(e, ws);
          }),
        );
      },
    };
    return {
      ...createWsRealPorts(ws, { preferences, auth, sessionStore }),
      connectionEvents,
      colorScheme,
      bootSplash,
    };
  }

  // Committed demo roster (see roster.ts / CLAUDE.md "Demo accounts"): all four
  // operators share the demo password so the real LoginScreen accepts any of them.
  const auth = new AuthSimulator({
    astark: "mcdc2026",
    nromanoff: "mcdc2026",
    tchalla: "mcdc2026",
    demo: "mcdc2026",
  });
  const gateway = new ConnectionEventsSimulator();
  const connectionEvents: ConnectionEventsPort = {
    events: () => {
      // Simulator branch: idle closes are faithfully no-ops (no real socket).
      // Recovery from idle is via the Reconnect button, which pushes reconnect$
      // → the real reconnect intent (IDLE_DISCONNECTED → CONNECTING) followed by
      // a simulated gatewayConnected (CONNECTING → CONNECTED). browserOnline also
      // recovers (unchanged). userActivity no longer auto-resumes (item 1).
      // Provenance: original services/connection.ts:43-50.
      return merge(
        gateway.events(),
        browser.events().pipe(
          mergeMap((e) => {
            return e.type === "browserOnline"
              ? of(e, { type: "gatewayConnected" as const })
              : of(e);
          }),
        ),
        reconnect$.pipe(
          mergeMap(() => {
            return of(
              { type: "reconnect" as const },
              { type: "gatewayConnected" as const },
            );
          }),
        ),
        incident$,
      );
    },
  };
  return {
    ...createSimulatorPorts({ preferences, auth, sessionStore }),
    connectionEvents,
    colorScheme,
    bootSplash,
  };
}
