import { merge, mergeMap, of, tap } from "rxjs";

import {
  type AppPorts,
  buildWsUrl,
  createSimulatorPorts,
  createWsRealPorts,
  incident$,
  reconnect$,
  routeIdleLifecycle,
  WsAdapter,
  WsConnectionEventsAdapter,
} from "@rtc/client-core";
import { instrumentWsAdapter } from "@rtc/devtools-core";
import {
  type ConnectionEventsPort,
  ConnectionEventsSimulator,
} from "@rtc/domain";

import { BrowserConnectionEventsAdapter } from "#/app/adapters/BrowserConnectionEventsAdapter";
import { LocalStoragePreferencesAdapter } from "#/app/adapters/LocalStoragePreferencesAdapter";
import { devtoolsHub } from "#/app/devtools/devtoolsHub";
import { MediaQueryColorSchemeAdapter } from "#/app/theme/MediaQueryColorSchemeAdapter";
import { shouldPlayBootSplash } from "#/bootSplashGate";

export function buildBrowserPorts(): AppPorts {
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const token = import.meta.env.VITE_WS_TOKEN as string | undefined;
  const browser = new BrowserConnectionEventsAdapter();
  const preferences = new LocalStoragePreferencesAdapter();
  const colorScheme = new MediaQueryColorSchemeAdapter();
  // One-shot boot-splash decision (webdriver/nosplash suppress it) — read at
  // composition time to seed the BootGatePresenter.
  const bootSplash = { shouldPlay: shouldPlayBootSplash };

  if (url) {
    // Wrap the transport in the devtools wire tap at construction so every
    // send/on/rpc is mirrored to the hub (dormant until an inspector attaches).
    // The simulator branch below has no adapter — its wire panel is simply empty.
    const ws = instrumentWsAdapter(
      new WsAdapter(buildWsUrl(url, token)),
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
      ...createWsRealPorts(ws, { preferences }),
      connectionEvents,
      colorScheme,
      bootSplash,
    };
  }

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
    ...createSimulatorPorts({ preferences }),
    connectionEvents,
    colorScheme,
    bootSplash,
  };
}
