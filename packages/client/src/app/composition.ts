import { merge, mergeMap, of } from "rxjs";
import {
  ConnectionEventsSimulator,
  type ConnectionEvent,
  type ConnectionEventsPort,
} from "@rtc/domain";

import { PriceStreamPresenter } from "./presenters/PriceStreamPresenter";
import { PriceHistoryPresenter } from "./presenters/PriceHistoryPresenter";
import { TradeExecutionPresenter } from "./presenters/TradeExecutionPresenter";
import { BlotterPresenter } from "./presenters/BlotterPresenter";
import { AnalyticsPresenter } from "./presenters/AnalyticsPresenter";
import { RfqsPresenter } from "./presenters/RfqsPresenter";
import { CurrencyPairsPresenter } from "./presenters/CurrencyPairsPresenter";
import { InstrumentsPresenter } from "./presenters/InstrumentsPresenter";
import { DealersPresenter } from "./presenters/DealersPresenter";
import { ConnectionStatusPresenter } from "./presenters/ConnectionStatusPresenter";
import { RfqQuotePresenter } from "./presenters/RfqQuotePresenter";
import { createTileExecutionMachine } from "./presenters/TileExecutionMachine";
import { createRfqTileMachine } from "./presenters/RfqTileMachine";
import { createStaleFlagMachine } from "./presenters/StaleFlagMachine";
import type { MachineFactories } from "./presenters/machine";

import { WsAdapter } from "./adapters/WsAdapter";
import { BrowserConnectionEventsAdapter } from "./adapters/BrowserConnectionEventsAdapter";
import { WsConnectionEventsAdapter } from "./adapters/WsConnectionEventsAdapter";
import {
  createSimulatorPorts,
  createWsRealPorts,
  type AppPorts,
} from "./adapters/portFactory";

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
      events: () => merge(gateway.events(), browser.events()),
    };
    return { ...createWsRealPorts(ws), connectionEvents };
  }
  const gateway = new ConnectionEventsSimulator();
  const connectionEvents: ConnectionEventsPort = {
    events: () =>
      merge(
        gateway.events(),
        browser.events().pipe(
          mergeMap((e) =>
            e.type === "browserOnline" || e.type === "userActivity"
              ? of(e, { type: "gatewayConnected" as const })
              : of(e),
          ),
        ),
      ),
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
  };
  return { presenters, ports };
}

/** Build the app-layer machine factories the hooks seam injects. Each factory
 * spins up a fresh machine per component mount, wired to the presenters. */
export function createMachineFactories(presenters: Presenters): MachineFactories {
  return {
    tileExecution: (pair) =>
      createTileExecutionMachine(pair, {
        execute: (input) => presenters.execution.execute(input),
      }),
    rfqTile: (pair) =>
      createRfqTileMachine(pair, {
        requestQuote: (symbol, pipsPosition) =>
          presenters.rfqQuote.requestQuote(symbol, pipsPosition),
      }),
    staleFlag: (pair) =>
      createStaleFlagMachine({
        status$: presenters.connection.status$,
        value$: presenters.priceStream.price$(pair),
      }),
    analyticsStaleFlag: () =>
      createStaleFlagMachine({
        status$: presenters.connection.status$,
        value$: presenters.analytics.position$,
      }),
  };
}
