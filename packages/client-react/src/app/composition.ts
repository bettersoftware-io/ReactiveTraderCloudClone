import { merge, mergeMap, of, tap } from "rxjs";

import {
  type ConnectionEventsPort,
  ConnectionEventsSimulator,
  type CurrencyPair,
  type ExecuteTradeInput,
} from "@rtc/domain";

import { BrowserConnectionEventsAdapter } from "./adapters/BrowserConnectionEventsAdapter";
import {
  type AppPorts,
  createSimulatorPorts,
  createWsRealPorts,
} from "./adapters/portFactory";
import { WsAdapter } from "./adapters/WsAdapter";
import { WsConnectionEventsAdapter } from "./adapters/WsConnectionEventsAdapter";
import { AnalyticsPresenter } from "./presenters/AnalyticsPresenter";
import { BlotterPresenter } from "./presenters/BlotterPresenter";
import { ConnectionStatusPresenter } from "./presenters/ConnectionStatusPresenter";
import { CurrencyPairsPresenter } from "./presenters/CurrencyPairsPresenter";
import { DealersPresenter } from "./presenters/DealersPresenter";
import { InstrumentsPresenter } from "./presenters/InstrumentsPresenter";
import type { MachineFactories } from "./presenters/machine";
import { createNotionalMachine } from "./presenters/NotionalMachine";
import { PriceHistoryPresenter } from "./presenters/PriceHistoryPresenter";
import { PriceStreamPresenter } from "./presenters/PriceStreamPresenter";
import { RfqQuotePresenter } from "./presenters/RfqQuotePresenter";
import { RfqsPresenter } from "./presenters/RfqsPresenter";
import { createRfqTileMachine } from "./presenters/RfqTileMachine";
import { createRowHighlightMachine } from "./presenters/RowHighlightMachine";
import { createStaleFlagMachine } from "./presenters/StaleFlagMachine";
import { ThemePreferencePresenter } from "./presenters/ThemePreferencePresenter";
import { ThroughputPresenter } from "./presenters/ThroughputPresenter";
import { createTileExecutionMachine } from "./presenters/TileExecutionMachine";
import { TradeExecutionPresenter } from "./presenters/TradeExecutionPresenter";
import { ViewModePreferencePresenter } from "./presenters/ViewModePreferencePresenter";

export type { AppPorts };

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
  viewModePreference: ViewModePreferencePresenter;
}

export interface App {
  presenters: Presenters;
  ports: AppPorts;
}

export function buildDefaultPorts(): AppPorts {
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const browser = new BrowserConnectionEventsAdapter();

  if (url) {
    const ws = new WsAdapter(url);
    const gateway = new WsConnectionEventsAdapter(ws);
    const connectionEvents: ConnectionEventsPort = {
      events: () => {
        return merge(gateway.events(), browser.events()).pipe(
          // Side-effect the transport in lock-step: idle timeout closes the
          // gateway socket; user activity (after an idle close) re-establishes
          // it. Reconnect is user-initiated, matching original
          // services/connection.ts:91-93.
          tap((e) => {
            if (e.type === "idleTimeout") ws.closeForIdle();
            // reopen() is a no-op unless idleClosed, so frequent userActivity
            // events while CONNECTED do not churn the socket.
            else if (e.type === "userActivity") ws.reopen();
          }),
        );
      },
    };
    return { ...createWsRealPorts(ws), connectionEvents };
  }

  const gateway = new ConnectionEventsSimulator();
  const connectionEvents: ConnectionEventsPort = {
    events: () => {
      // Idle teardown is a faithful no-op in simulator mode: there is no real
      // socket to close. The state machine still reaches IDLE_DISCONNECTED and
      // userActivity already re-emits gatewayConnected to resume.
      return merge(
        gateway.events(),
        browser.events().pipe(
          mergeMap((e) => {
            return e.type === "browserOnline" || e.type === "userActivity"
              ? of(e, { type: "gatewayConnected" as const })
              : of(e);
          }),
        ),
      );
    },
  };
  return { ...createSimulatorPorts(), connectionEvents };
}

export function createApp(ports: AppPorts = buildDefaultPorts()): App {
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
    connection: new ConnectionStatusPresenter(ports.connectionEvents),
    rfqQuote: new RfqQuotePresenter(ports.pricing),
    throughput: new ThroughputPresenter(ports.admin),
    themePreference: new ThemePreferencePresenter(ports.preferences),
    viewModePreference: new ViewModePreferencePresenter(ports.preferences),
  };
  return { presenters, ports };
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
  };
}
