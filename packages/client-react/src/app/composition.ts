import { merge, mergeMap, of, Subject, tap } from "rxjs";

import {
  type BootVariant,
  type ConnectionEvent,
  type ConnectionEventsPort,
  ConnectionEventsSimulator,
  type CurrencyPair,
  type ExecuteTradeInput,
} from "@rtc/domain";

import { BrowserConnectionEventsAdapter } from "./adapters/BrowserConnectionEventsAdapter";
import type { IWsAdapter } from "./adapters/IWsAdapter";
import {
  type AppPorts,
  createSimulatorPorts,
  createWsRealPorts,
} from "./adapters/portFactory";
import { WsAdapter } from "./adapters/WsAdapter";
import { WsConnectionEventsAdapter } from "./adapters/WsConnectionEventsAdapter";
import {
  createDefaultLayoutPort,
  type WorkspaceTab,
} from "./layout/defaultLayoutPort";
import { AnalyticsPresenter } from "./presenters/AnalyticsPresenter";
import { AnimatedBackgroundPresenter } from "./presenters/AnimatedBackgroundPresenter";
import { AnimationDirector } from "./presenters/AnimationDirector";
import { BlotterPresenter } from "./presenters/BlotterPresenter";
import { BootPreferencePresenter } from "./presenters/BootPreferencePresenter";
import { createBootSequenceMachine } from "./presenters/BootSequenceMachine";
import { ConnectionStatusPresenter } from "./presenters/ConnectionStatusPresenter";
import { CurrencyPairsPresenter } from "./presenters/CurrencyPairsPresenter";
import { DealersPresenter } from "./presenters/DealersPresenter";
import { InstrumentsPresenter } from "./presenters/InstrumentsPresenter";
import { createLayoutMachine } from "./presenters/LayoutMachine";
import type { MachineFactories } from "./presenters/machine";
import { createNotionalMachine } from "./presenters/NotionalMachine";
import { PriceHistoryPresenter } from "./presenters/PriceHistoryPresenter";
import { PriceStreamPresenter } from "./presenters/PriceStreamPresenter";
import { RfqQuotePresenter } from "./presenters/RfqQuotePresenter";
import { RfqsPresenter } from "./presenters/RfqsPresenter";
import { createRfqTileMachine } from "./presenters/RfqTileMachine";
import { createRowHighlightMachine } from "./presenters/RowHighlightMachine";
import { SessionPresenter } from "./presenters/SessionPresenter";
import { createStaleFlagMachine } from "./presenters/StaleFlagMachine";
import { ThemePreferencePresenter } from "./presenters/ThemePreferencePresenter";
import { ThemeSkinPreferencePresenter } from "./presenters/ThemeSkinPreferencePresenter";
import { ThroughputPresenter } from "./presenters/ThroughputPresenter";
import { createTileExecutionMachine } from "./presenters/TileExecutionMachine";
import { TradeExecutionPresenter } from "./presenters/TradeExecutionPresenter";
import { ViewModePreferencePresenter } from "./presenters/ViewModePreferencePresenter";
import { buildWsUrl } from "./wsUrl";

export type { AppPorts };

/** The reconnect-intent event emitted from the Reconnect button. */
interface ReconnectIntent {
  type: "reconnect";
}

/** Routes idle-lifecycle events to the WS adapter. Exported so the wiring is
 * directly testable (idleTeardown.test.ts).
 * - idleTimeout  → closeForIdle() (suppresses auto-reconnect)
 * - reconnect    → reopen()       (sole recovery from idle; button-only)
 * - userActivity → no-op here     (resets countdown in BrowserConnectionEventsAdapter
 *                                   only; does NOT reopen the socket)
 * Provenance: original services/connection.ts:74-96. */
export function routeIdleLifecycle(
  event: ConnectionEvent,
  ws: Pick<IWsAdapter, "closeForIdle" | "reopen">,
): void {
  if (event.type === "idleTimeout") ws.closeForIdle();
  else if (event.type === "reconnect") ws.reopen();
}

export interface Presenters {
  priceStream: PriceStreamPresenter;
  priceHistory: PriceHistoryPresenter;
  execution: TradeExecutionPresenter;
  blotter: BlotterPresenter;
  analytics: AnalyticsPresenter;
  rfqs: RfqsPresenter;
  currencyPairs: CurrencyPairsPresenter;
  instruments: InstrumentsPresenter;
  dealers: DealersPresenter;
  connection: ConnectionStatusPresenter;
  rfqQuote: RfqQuotePresenter;
  throughput: ThroughputPresenter;
  themePreference: ThemePreferencePresenter;
  themeSkinPreference: ThemeSkinPreferencePresenter;
  animatedBackground: AnimatedBackgroundPresenter;
  viewModePreference: ViewModePreferencePresenter;
  animationDirector: AnimationDirector;
  bootPreference: BootPreferencePresenter;
  session: SessionPresenter;
}

export interface AppCommands {
  /** Push a user-initiated reconnect intent (wired to reconnect$ in composition). */
  reconnect(): void;
}

export interface App {
  presenters: Presenters;
  ports: AppPorts;
  commands: AppCommands;
}

/** User-initiated reconnect intent Subject. Owned in composition so both the
 * real-WS and simulator branches can merge it, and the hook factory can push
 * into it via AppCommands.reconnect(). */
const reconnect$ = new Subject<ReconnectIntent>();

export function buildDefaultPorts(): AppPorts {
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const token = import.meta.env.VITE_WS_TOKEN as string | undefined;
  const browser = new BrowserConnectionEventsAdapter();

  if (url) {
    const ws = new WsAdapter(buildWsUrl(url, token));
    const gateway = new WsConnectionEventsAdapter(ws);
    const connectionEvents: ConnectionEventsPort = {
      events: () => {
        // Merge gateway events, browser lifecycle events, and user-initiated
        // reconnect intents. The tap side-effects the transport:
        //   idleTimeout → closeForIdle()
        //   reconnect   → reopen()       (sole recovery; button-only)
        //   userActivity → no-op here    (resets countdown in BrowserAdapter)
        // Provenance: original services/connection.ts:74-96.
        return merge(gateway.events(), browser.events(), reconnect$).pipe(
          tap((e) => {
            return routeIdleLifecycle(e, ws);
          }),
        );
      },
    };
    return { ...createWsRealPorts(ws), connectionEvents };
  }

  const gateway = new ConnectionEventsSimulator();
  const connectionEvents: ConnectionEventsPort = {
    events: () => {
      // Simulator branch: idle closes are faithfully no-ops (no real socket).
      // Recovery from idle is via the Reconnect button, which pushes reconnect$
      // → gatewayConnected to resume the state machine. browserOnline also
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
            return of({ type: "gatewayConnected" as const });
          }),
        ),
      );
    },
  };
  return { ...createSimulatorPorts(), connectionEvents };
}

export function createApp(ports: AppPorts = buildDefaultPorts()): App {
  // Hoisted so the AnimationDirector can wire its connectionStatus$ source from
  // the same connection presenter instance the rest of the app consumes.
  const connection = new ConnectionStatusPresenter(ports.connectionEvents);
  const presenters: Presenters = {
    priceStream: new PriceStreamPresenter(ports.pricing),
    priceHistory: new PriceHistoryPresenter(ports.pricing),
    execution: new TradeExecutionPresenter(ports.execution),
    blotter: new BlotterPresenter(ports.blotter),
    analytics: new AnalyticsPresenter(ports.analytics),
    rfqs: new RfqsPresenter(ports.workflow),
    currencyPairs: new CurrencyPairsPresenter(ports.referenceData),
    instruments: new InstrumentsPresenter(ports.instruments),
    dealers: new DealersPresenter(ports.dealers),
    connection,
    rfqQuote: new RfqQuotePresenter(ports.pricing),
    throughput: new ThroughputPresenter(ports.admin),
    themePreference: new ThemePreferencePresenter(ports.preferences),
    themeSkinPreference: new ThemeSkinPreferencePresenter(ports.preferences),
    animatedBackground: new AnimatedBackgroundPresenter(ports.preferences),
    viewModePreference: new ViewModePreferencePresenter(ports.preferences),
    // Phase 0 wiring: connection-change intents only. Per-pair tick sources are
    // an ASYNC stream (currencyPairs.pairs$) with no synchronous list at
    // composition time, so priceStreams is empty here — per-pair tick sources
    // attach in Phase 3 when tiles consume intents. The seam (and the
    // useAnimationIntents hook) is still exercised via connectionStatus$.
    animationDirector: new AnimationDirector({
      priceStreams: {},
      connectionStatus$: connection.status$,
    }),
    bootPreference: new BootPreferencePresenter(ports.preferences),
    // Session lock/unlock state over the static demo user (no real auth backend).
    session: new SessionPresenter(),
  };
  const commands: AppCommands = {
    reconnect: () => {
      reconnect$.next({ type: "reconnect" });
    },
  };
  return { presenters, ports, commands };
}

/** Build the app-layer machine factories the hooks seam injects. Each factory
 * spins up a fresh machine per component mount, wired to the presenters. */
export function createMachineFactories(
  presenters: Presenters,
): MachineFactories {
  return {
    tileExecution: (pair: CurrencyPair) => {
      return createTileExecutionMachine(pair, {
        execute: (input: ExecuteTradeInput) => {
          return presenters.execution.execute(input);
        },
      });
    },
    rfqTile: (pair: CurrencyPair) => {
      return createRfqTileMachine(pair, {
        requestQuote: (symbol: string, pipsPosition: number) => {
          return presenters.rfqQuote.requestQuote(symbol, pipsPosition);
        },
      });
    },
    staleFlag: (pair: CurrencyPair) => {
      return createStaleFlagMachine({
        status$: presenters.connection.status$,
        value$: presenters.priceStream.price$(pair),
      });
    },
    analyticsStaleFlag: () => {
      return createStaleFlagMachine({
        status$: presenters.connection.status$,
        value$: presenters.analytics.position$,
      });
    },
    rowHighlight: (isNew: boolean) => {
      return createRowHighlightMachine(isNew);
    },
    notional: (defaultNotional: number) => {
      return createNotionalMachine(defaultNotional);
    },
    rfqSubmission: () => {
      return presenters.rfqs.createSubmission();
    },
    ticketSubmission: () => {
      return presenters.rfqs.createTicketSubmission();
    },
    layout: (tab: WorkspaceTab) => {
      return createLayoutMachine(createDefaultLayoutPort(tab));
    },
    boot: (onDone: () => void) => {
      return createBootSequenceMachine({
        variant: presenters.bootPreference.current(),
        advance: (next: BootVariant): void => {
          presenters.bootPreference.setVariant(next);
        },
        onDone,
      });
    },
  };
}
