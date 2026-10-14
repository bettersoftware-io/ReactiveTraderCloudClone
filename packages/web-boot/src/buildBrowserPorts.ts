import { merge, mergeMap, of, tap } from "rxjs";

import { shouldPlayBootSplash } from "@rtc/boot-splash";
import {
  createRoutingAuthPort,
  createSimulatorPorts,
  createWsRealPorts,
  formatDataSourceMessage,
  HttpAuthAdapter,
  mergeGatewayAndBrowserEvents,
  pairConnectionPorts,
  resolveDataSource,
  routeIdleLifecycle,
  WsAdapter,
  WsConnectionEventsAdapter,
  wsUrlToHttpBase,
} from "@rtc/client-adapters";
import type { AppPorts } from "@rtc/core-api";
import { type DevtoolsHub, instrumentWsAdapter } from "@rtc/devtools-core";
import {
  type AnomalyDetectorConfig,
  type AuthPort,
  AuthSimulator,
  type ConnectionEventsPort,
  ConnectionEventsSimulator,
  type DemoAccount,
  listDemoAccounts,
} from "@rtc/domain";

import { BrowserConnectionEventsAdapter } from "#/adapters/BrowserConnectionEventsAdapter";
import { LocalStorageDataSourceStore } from "#/adapters/LocalStorageDataSourceStore";
import { LocalStorageDockLayoutStore } from "#/adapters/LocalStorageDockLayoutStore";
import { LocalStorageLayoutPresetStore } from "#/adapters/LocalStorageLayoutPresetStore";
import { LocalStoragePreferencesAdapter } from "#/adapters/LocalStoragePreferencesAdapter";
import { LocalStorageSessionStore } from "#/adapters/LocalStorageSessionStore";
import type { WebBootEnv } from "#/env";
import { MediaQueryColorSchemeAdapter } from "#/theme/MediaQueryColorSchemeAdapter";

/**
 * Parses `VITE_DEV_AUTH` / `VITE_DEMO_AUTH` (a JSON object of username ->
 * password, verified in the browser by an `AuthSimulator`) — tolerant of
 * missing/malformed values, returning `{}` rather than throwing so a
 * bad/absent value degrades to "no local logins work" instead of a boot
 * crash. Never logs the raw value (it's credentials).
 */
function parseDevAuth(raw: string | undefined): Record<string, string> {
  if (raw === undefined) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (typeof parsed !== "object" || parsed === null) {
      return {};
    }

    const entries = Object.entries(parsed as Record<string, unknown>).filter(
      (entry): entry is [string, string] => {
        return typeof entry[1] === "string";
      },
    );
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

/** Relaxed `NarratorMachine` detector thresholds for the `?narratorThresholds=test`
 * dev/e2e seam — see `seamNarratorConfig`'s doc for when this actually applies. */
const TEST_NARRATOR_CONFIG: Partial<AnomalyDetectorConfig> = {
  windowSize: 8,
  minWindowFill: 4,
  spreadSigma: 0.1,
  volSigma: 0.1,
};

/**
 * Override for `NarratorMachine`'s anomaly-detector thresholds, for a dev
 * server and for the build the e2e harness makes. `PricingSimulator`'s
 * anomaly episodes are rare by design (about one per symbol every 14 minutes —
 * see `pricingAnomalyEpisode.ts`), so an e2e run, or a person, that wants to
 * see the proactive narrator needs a way to force a crossing instead of
 * waiting one out.
 *
 * Two conditions, both required:
 *
 * - The build allows it: `env.narratorTestSeam`, which `webBootEnvOf` sets
 *   on a dev build and on a production build made with
 *   `VITE_NARRATOR_TEST_SEAM=1`. Only `tests/scripts/clientServer.ts` sets
 *   that variable; no deploy does. The relaxed thresholds are in every
 *   bundle; without the flag nothing can switch them on.
 * - The page asked for it with `?narratorThresholds=test`.
 */
function seamNarratorConfig(
  env: WebBootEnv,
): Partial<AnomalyDetectorConfig> | undefined {
  if (!env.narratorTestSeam) {
    return undefined;
  }

  const params = new URLSearchParams(window.location.search);

  return params.get("narratorThresholds") === "test"
    ? TEST_NARRATOR_CONFIG
    : undefined;
}

export interface BuildBrowserPortsOptions {
  /** The build-time values: `webBootEnvOf(import.meta.env)` in a client. */
  readonly env: WebBootEnv;
  /** The page's devtools hub: the WS transport is mirrored to it. */
  readonly devtoolsHub: DevtoolsHub;
  /** Slot: how a mode-change login reloads the page (hardening spec §8.3
   * step 3). Defaults to `location.reload()`; tests inject a spy. */
  readonly relaunch?: () => void;
}

function reloadPage(): void {
  location.reload();
}

export function buildBrowserPorts(options: BuildBrowserPortsOptions): AppPorts {
  const { env, devtoolsHub } = options;
  const url = env.serverUrl;
  const demoRoster = parseDevAuth(env.demoAuth);
  const narratorConfig = seamNarratorConfig(env);
  const browser = new BrowserConnectionEventsAdapter();
  const preferences = new LocalStoragePreferencesAdapter();
  const sessionStore = new LocalStorageSessionStore();
  const dataSourceStore = new LocalStorageDataSourceStore();
  const colorScheme = new MediaQueryColorSchemeAdapter();
  const dockLayoutStore = new LocalStorageDockLayoutStore();
  const layoutPresetStore = new LocalStorageLayoutPresetStore();
  // One-shot boot-splash decision (webdriver/nosplash suppress it) — read at
  // composition time to seed the BootGatePresenter.
  const bootSplash = { shouldPlay: shouldPlayBootSplash };

  // Which port set this page composes (hardening spec §8.2): no server URL →
  // sim; server URL without a demo roster → live (today's WS-real mode, byte
  // for byte); both → hybrid, where the last login's stored choice decides.
  const decision = resolveDataSource({
    serverUrl: url,
    hasDemoRoster: Object.keys(demoRoster).length > 0,
    stored: dataSourceStore.read(),
    hasStoredSession: sessionStore.read() !== null,
  });
  console.info(formatDataSourceMessage(decision));

  // Simulator roster: the dev file's accounts (dev builds only — Vite loads
  // .env.development in dev) plus the committed demo roster (.env.production),
  // so a production simulator build has working demo logins too.
  const simulatorAuth = new AuthSimulator(
    readSimulatorCredentials(env, demoRoster),
  );

  // Hybrid data source — hardening spec §8.
  /** The page's auth port. Non-hybrid pages keep today's single adapter;
   * a hybrid page routes demo credentials locally and everything else to
   * the server, relaunching when the login lands in the other mode. */
  function buildAuth(live: AuthPort | null): AuthPort {
    if (!decision.hybrid || live === null) {
      return live ?? simulatorAuth;
    }

    return createRoutingAuthPort({
      demo: new AuthSimulator(demoRoster),
      live,
      composed: decision.source,
      sessionStore,
      dataSourceStore,
      relaunch: options.relaunch ?? reloadPage,
    });
  }

  // `url` is already narrowed by `resolveDataSource` (no URL → never `live`),
  // but TypeScript cannot see that, hence the `&& url` guards here and below.
  if (decision.source === "live" && url) {
    const auth = buildAuth(new HttpAuthAdapter(wsUrlToHttpBase(url)));
    // Wrap the transport in the devtools wire tap at construction so every
    // send/on/rpc is mirrored to the hub (dormant until an inspector attaches).
    // The simulator branch below has no adapter — its wire panel is simply empty.
    const ws = instrumentWsAdapter(
      // autoConnect: false — the socket is opened by createApp's auth gate once
      // the user is authenticated. Connecting here (at composition time) would
      // send a tokenless upgrade the server rejects, then retry it on a timer
      // behind the login screen.
      new WsAdapter(
        url,
        () => {
          return sessionStore.read()?.token;
        },
        { autoConnect: false },
      ),
      devtoolsHub,
    );
    const gateway = new WsConnectionEventsAdapter(ws);
    // Pairs THIS composition's own reconnect/incident intents with the
    // gateway + browser lifecycle events. `@rtc/core-api`'s `TransportPorts`
    // omits `connectionEvents` AND `connectionIntents` together (ADR-006
    // Follow-up 5), so `connectionIntents` below MUST be `paired`'s own —
    // supplying it apart from the events it feeds is a type error, not just
    // a runtime footgun.
    const paired = pairConnectionPorts(
      mergeGatewayAndBrowserEvents(gateway.events(), browser.events()),
    );

    const connectionEvents: ConnectionEventsPort = {
      events: () => {
        // The tap side-effects the transport:
        //   idleTimeout → closeForIdle()
        //   reconnect   → reopen()       (sole recovery; button-only)
        //   userActivity → no-op here    (resets countdown in BrowserAdapter)
        // Provenance: original services/connection.ts:74-96.
        return paired.connectionEvents.events().pipe(
          tap((e) => {
            return routeIdleLifecycle(e, ws);
          }),
        );
      },
    };
    return {
      ...createWsRealPorts(ws, { preferences, auth, sessionStore }),
      connectionEvents,
      connectionIntents: paired.connectionIntents,
      colorScheme,
      dockLayoutStore,
      layoutPresetStore,
      bootSplash,
      transport: ws,
      narratorConfig,
    };
  }

  const auth = buildAuth(
    decision.hybrid && url ? new HttpAuthAdapter(wsUrlToHttpBase(url)) : null,
  );
  const gateway = new ConnectionEventsSimulator();
  return {
    ...createSimulatorPorts({ preferences, auth, sessionStore }),
    // Paired with THIS composition's own reconnect/incident intents, same as
    // the ws-real branch above, but rendering `reconnect()` as
    // "intent-then-connected": idle closes are faithfully no-ops (no real
    // socket), so recovery via the Reconnect button must synthesize the
    // `gatewayConnected` a real gateway would otherwise report itself
    // (IDLE_DISCONNECTED → CONNECTING → CONNECTED). browserOnline also
    // recovers (unchanged). userActivity no longer auto-resumes (item 1).
    // Provenance: original services/connection.ts:43-50.
    ...pairConnectionPorts(
      merge(
        gateway.events(),
        browser.events().pipe(
          mergeMap((e) => {
            return e.type === "browserOnline"
              ? of(e, { type: "gatewayConnected" as const })
              : of(e);
          }),
        ),
      ),
      { reconnectRendering: "intent-then-connected" },
    ),
    colorScheme,
    dockLayoutStore,
    layoutPresetStore,
    bootSplash,
    narratorConfig,
  };
}

/** Whether the login screen offers registration: only a page with a server
 * URL has anywhere to send a sign-up. An empty string is no URL (the
 * `dev:*:sim` scripts set `VITE_SERVER_URL=`). */
export function offersRegistration(env: WebBootEnv): boolean {
  return env.serverUrl !== undefined && env.serverUrl !== "";
}

/**
 * The sign-ins this page verifies IN THE BROWSER — what the login screen may
 * offer as its demo-accounts hint (hardening spec §7 D9). With a server URL
 * that is the demo roster alone: a hybrid build lists it, and a plain live
 * build (no demo roster — every `dev:*:fs` / `dev:*:ws:*` and e2e flow) lists
 * nothing, since all of its credentials belong to the server. With no server
 * it is the simulator's whole roster.
 */
export function readDemoAccounts(env: WebBootEnv): readonly DemoAccount[] {
  const demoRoster = parseDevAuth(env.demoAuth);

  if (env.serverUrl) {
    return listDemoAccounts(demoRoster);
  }

  return listDemoAccounts(readSimulatorCredentials(env, demoRoster));
}

/** The simulator's roster: the dev file's accounts plus the demo roster. */
function readSimulatorCredentials(
  env: WebBootEnv,
  demoRoster: Record<string, string>,
): Record<string, string> {
  return { ...parseDevAuth(env.devAuth), ...demoRoster };
}
