import Constants from "expo-constants";
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
import {
  type ConnectionEventsPort,
  ConnectionEventsSimulator,
} from "@rtc/domain";

import { AsyncStoragePreferencesAdapter } from "#/app/adapters/AsyncStoragePreferencesAdapter";

interface BuildNativePortsOptions {
  simulator?: boolean;
}

/** The RN analogue of `buildBrowserPorts` (client-react): assembles the
 * `AppPorts` that `createApp` composes into presenters. Two branches selected
 * by the WS URL — a real WebSocket stack when `extra.serverUrl` is set, else a
 * fully in-process simulator stack. There is no DOM here, so the browser
 * connectivity source and `colorScheme` port are both dropped (`colorScheme`
 * is optional; client-core's `of(false)` fallback applies).
 *
 * The `simulator` option forces the simulator branch regardless of config — the
 * demo toggle (Task 6) drives it. */
export function buildNativePorts(opts: BuildNativePortsOptions = {}): AppPorts {
  const extra = Constants.expoConfig?.extra ?? {};
  const url = opts.simulator
    ? undefined
    : (extra.serverUrl as string | undefined);
  const token = extra.wsToken as string | undefined;
  const preferences = new AsyncStoragePreferencesAdapter();

  if (url) {
    const ws = new WsAdapter(buildWsUrl(url, token));
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
    return { ...createWsRealPorts(ws, { preferences }), connectionEvents };
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
  return { ...createSimulatorPorts({ preferences }), connectionEvents };
}
