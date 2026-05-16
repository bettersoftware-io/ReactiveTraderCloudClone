import { concatMap, from, merge, of, type Observable } from "rxjs";
import {
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

/**
 * Wraps the BrowserConnectionEventsAdapter with a synthetic startup
 * `gatewayConnected` event so the state machine reaches CONNECTED
 * during application boot. Also synthesizes a `gatewayConnected` event
 * after every `browserOnline` event so that coming back from offline
 * returns to CONNECTED (not just CONNECTING). In future phases a real
 * gateway adapter will replace these synthetic emissions.
 */
export function withSyntheticGatewayConnected(
  inner: ConnectionEventsPort,
): ConnectionEventsPort {
  return {
    events(): Observable<ConnectionEvent> {
      const innerEvents$ = inner.events().pipe(
        concatMap((event) => {
          if (event.type === "browserOnline") {
            const pair: ConnectionEvent[] = [event, { type: "gatewayConnected" }];
            return from(pair);
          }
          return of(event);
        }),
      );
      return merge(of<ConnectionEvent>({ type: "gatewayConnected" }), innerEvents$);
    },
  };
}

export function buildDefaultPorts(): AppPorts {
  const url = import.meta.env.VITE_SERVER_URL as string | undefined;
  const transport = url ? createWsRealPorts(new WsAdapter(url)) : createSimulatorPorts();
  return {
    ...transport,
    connectionEvents: withSyntheticGatewayConnected(new BrowserConnectionEventsAdapter()),
  };
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
