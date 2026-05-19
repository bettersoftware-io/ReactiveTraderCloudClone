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
            e.type === "browserOnline"
              ? of(e, { type: "gatewayConnected" } as ConnectionEvent)
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
