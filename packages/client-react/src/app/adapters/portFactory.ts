import { Observable } from "rxjs";

import {
  type AdminPort,
  type AnalyticsPort,
  AnalyticsSimulator,
  type BlotterPort,
  type Candle,
  type ConnectionEventsPort,
  type CreateRfqRequest,
  CreditRfqSimulator,
  type CurrencyPair,
  DEALERS_CATALOG,
  type Dealer,
  type DealerPort,
  DealerSimulator,
  type DepthBook,
  deriveBaseTerm,
  type EquityInstrument,
  EquityMarketDataSimulator,
  type EquityOrder,
  EquityOrderSimulator,
  type EquityPosition,
  EquityPositionSimulator,
  type EquityQuote,
  type ExecutionPort,
  type ExecutionRequest,
  ExecutionSimulator,
  type FillEvent,
  type Instrument,
  type InstrumentPort,
  InstrumentSimulator,
  type MarketDataPort,
  type OrderPort,
  type PlaceOrderRequest,
  type PositionPort,
  type PositionUpdates,
  type PreferencesPort,
  type PriceTick,
  type PricingPort,
  PricingSimulator,
  type QuoteRequest,
  type ReferenceDataPort,
  ReferenceDataSimulator,
  type RfqEvent,
  type RfqQuoteResult,
  ThroughputSimulator,
  type Trade,
  TradeStoreSimulator,
  type WorkflowPort,
} from "@rtc/domain";
import type {
  AnalyticsDto,
  BlotterMessage,
  DealerEvent,
  ExecutionRequestDto,
  ExecutionResponseDto,
  InstrumentEvent,
  PriceHistoryDto,
  PriceTickDto,
  ReferenceDataMessage,
  RpcResponse,
  WorkflowEvent,
} from "@rtc/shared";

import type { IWsAdapter } from "./IWsAdapter";
import { LocalStoragePreferencesAdapter } from "./LocalStoragePreferencesAdapter";

export interface AppPorts {
  referenceData: ReferenceDataPort;
  pricing: PricingPort;
  execution: ExecutionPort;
  blotter: BlotterPort;
  analytics: AnalyticsPort;
  instruments: InstrumentPort;
  dealers: DealerPort;
  workflow: WorkflowPort;
  admin: AdminPort;
  preferences: PreferencesPort;
  connectionEvents: ConnectionEventsPort;
  marketData: MarketDataPort;
  orders: OrderPort;
  positions: PositionPort;
}

export type TransportPorts = Omit<AppPorts, "connectionEvents">;

export function createSimulatorPorts(): TransportPorts {
  const execution = new ExecutionSimulator();
  const marketData = new EquityMarketDataSimulator();
  const positionsSim = new EquityPositionSimulator(marketData);
  const orders = new EquityOrderSimulator({
    listener: (fill: FillEvent): void => {
      positionsSim.onFill(fill);
    },
  });
  return {
    referenceData: new ReferenceDataSimulator(),
    pricing: new PricingSimulator(),
    execution,
    blotter: new TradeStoreSimulator(execution),
    analytics: new AnalyticsSimulator(),
    instruments: new InstrumentSimulator(),
    dealers: new DealerSimulator(),
    workflow: new CreditRfqSimulator(DEALERS_CATALOG),
    admin: new ThroughputSimulator(),
    // Real browser persistence even in sim mode — PreferencesSimulator is for
    // domain tests/fakes only.
    preferences: new LocalStoragePreferencesAdapter(),
    marketData,
    orders,
    positions: positionsSim,
  };
}

// ── Protocol constants (mirrored from server) ───────────────────

const CLIENT_MSG = {
  SUBSCRIBE_REFERENCE_DATA: "subscribe.referenceData",
  SUBSCRIBE_PRICING: "subscribe.pricing",
  SUBSCRIBE_BLOTTER: "subscribe.blotter",
  SUBSCRIBE_ANALYTICS: "subscribe.analytics",
  SUBSCRIBE_INSTRUMENTS: "subscribe.instruments",
  SUBSCRIBE_DEALERS: "subscribe.dealers",
  SUBSCRIBE_WORKFLOW: "subscribe.workflow",
  EXECUTE_TRADE: "rpc.executeTrade",
  GET_PRICE_HISTORY: "rpc.getPriceHistory",
  CREATE_RFQ: "rpc.createRfq",
  CANCEL_RFQ: "rpc.cancelRfq",
  QUOTE: "rpc.quote",
  PASS: "rpc.pass",
  ACCEPT: "rpc.accept",
  GET_THROUGHPUT: "admin.getThroughput",
  SET_THROUGHPUT: "admin.setThroughput",
  SUBSCRIBE_WATCHLIST: "subscribe.watchlist",
  SUBSCRIBE_EQ_QUOTES: "subscribe.eqQuotes",
  GET_CANDLES: "rpc.getCandles",
  SUBSCRIBE_DEPTH: "subscribe.depth",
  PLACE_ORDER: "rpc.placeOrder",
  CANCEL_ORDER: "rpc.cancelOrder",
  SUBSCRIBE_ORDERS: "subscribe.orders",
  SUBSCRIBE_POSITIONS: "subscribe.positions",
} as const;

const SERVER_MSG = {
  REFERENCE_DATA: "stream.referenceData",
  PRICE_TICK: "stream.priceTick",
  BLOTTER: "stream.blotter",
  ANALYTICS: "stream.analytics",
  INSTRUMENT_EVENT: "stream.instrumentEvent",
  DEALER_EVENT: "stream.dealerEvent",
  WORKFLOW_EVENT: "stream.workflowEvent",
  EXECUTION_RESPONSE: "rpc.executeTrade.response",
  PRICE_HISTORY_RESPONSE: "rpc.getPriceHistory.response",
  CREATE_RFQ_RESPONSE: "rpc.createRfq.response",
  CANCEL_RFQ_RESPONSE: "rpc.cancelRfq.response",
  QUOTE_RESPONSE: "rpc.quote.response",
  PASS_RESPONSE: "rpc.pass.response",
  ACCEPT_RESPONSE: "rpc.accept.response",
  THROUGHPUT_RESPONSE: "admin.getThroughput.response",
  SET_THROUGHPUT_RESPONSE: "admin.setThroughput.response",
  WATCHLIST: "stream.watchlist",
  EQ_QUOTE: "stream.eqQuote",
  CANDLES_RESPONSE: "rpc.getCandles.response",
  DEPTH: "stream.depth",
  ORDER_LIFECYCLE: "stream.orderLifecycle",
  CANCEL_ORDER_RESPONSE: "rpc.cancelOrder.response",
  ORDERS: "stream.orders",
  POSITIONS: "stream.positions",
} as const;

// ── Port Implementations ────────────────────────────────────────

function createReferenceDataPort(ws: IWsAdapter): ReferenceDataPort {
  return {
    getCurrencyPairs(): Observable<readonly CurrencyPair[]> {
      return new Observable<readonly CurrencyPair[]>((subscriber) => {
        const unsub = ws.on(SERVER_MSG.REFERENCE_DATA, (payload) => {
          const msg = payload as ReferenceDataMessage;
          const pairs: CurrencyPair[] = msg.updates.map((dto) => {
            return {
              ...deriveBaseTerm(dto.symbol),
              symbol: dto.symbol,
              ratePrecision: dto.ratePrecision,
              pipsPosition: dto.pipsPosition,
              defaultNotional: dto.symbol === "NZDUSD" ? 10_000_000 : 1_000_000,
            };
          });
          subscriber.next(pairs);
        });
        ws.send(CLIENT_MSG.SUBSCRIBE_REFERENCE_DATA);

        return () => {
          unsub();
        };
      });
    },
  };
}

function createPricingPort(ws: IWsAdapter): PricingPort {
  return {
    getPriceUpdates(symbol: string): Observable<PriceTick> {
      return new Observable<PriceTick>((subscriber) => {
        const unsub = ws.on(SERVER_MSG.PRICE_TICK, (payload) => {
          const dto = payload as PriceTickDto;

          if (dto.symbol === symbol) {
            subscriber.next(dto);
          }
        });
        ws.send(CLIENT_MSG.SUBSCRIBE_PRICING, { symbol });

        return () => {
          unsub();
        };
      });
    },

    getPriceHistory(symbol: string): Observable<readonly PriceTick[]> {
      return new Observable<readonly PriceTick[]>((subscriber) => {
        let cancelled = false;

        void (async () => {
          try {
            const resp = (await ws.rpc(CLIENT_MSG.GET_PRICE_HISTORY, {
              symbol,
            })) as RpcResponse<PriceHistoryDto>;
            if (cancelled) return;

            if (resp.type === "nack") {
              subscriber.error(new Error("Failed to get price history"));
              return;
            }

            const prices = resp.payload;
            if (!prices) throw new Error("ack response missing payload");
            subscriber.next(prices.prices);
            subscriber.complete();
          } catch (e) {
            if (!cancelled) subscriber.error(e);
          }
        })();

        return () => {
          cancelled = true;
        };
      });
    },

    getRfqQuote(
      symbol: string,
      pipsPosition: number,
    ): Observable<RfqQuoteResult> {
      // No dedicated wire RPC for FX RFQ quotes; derive from the latest price-history tick.
      return new Observable<RfqQuoteResult>((subscriber) => {
        let cancelled = false;

        void (async () => {
          try {
            const resp = (await ws.rpc(CLIENT_MSG.GET_PRICE_HISTORY, {
              symbol,
            })) as RpcResponse<PriceHistoryDto>;
            if (cancelled) return;

            if (
              resp.type === "nack" ||
              !resp.payload ||
              resp.payload.prices.length === 0
            ) {
              subscriber.error(new Error(`No price available for ${symbol}`));
              return;
            }

            const last = resp.payload.prices[resp.payload.prices.length - 1];
            const priceChange = 0.3 / 10 ** pipsPosition;
            subscriber.next({
              ask: last.ask + priceChange,
              bid: last.bid - priceChange,
              mid: last.mid,
            });
            subscriber.complete();
          } catch (e) {
            if (!cancelled) subscriber.error(e);
          }
        })();

        return () => {
          cancelled = true;
        };
      });
    },
  };
}

function createExecutionPort(ws: IWsAdapter): ExecutionPort {
  return {
    executeTrade(request: ExecutionRequest): Observable<Trade> {
      return new Observable<Trade>((subscriber) => {
        let cancelled = false;
        const dto: ExecutionRequestDto = {
          currencyPair: request.currencyPair,
          spotRate: request.spotRate,
          valueDate: new Date().toISOString().slice(0, 10),
          direction: request.direction,
          notional: request.notional,
          dealtCurrency: request.dealtCurrency,
        };

        void (async () => {
          try {
            const resp = (await ws.rpc(
              CLIENT_MSG.EXECUTE_TRADE,
              dto,
            )) as RpcResponse<ExecutionResponseDto>;
            if (cancelled) return;

            if (resp.type === "nack") {
              subscriber.error(new Error("Trade execution failed"));
              return;
            }

            const r = resp.payload;
            if (!r) throw new Error("ack response missing payload");
            subscriber.next({
              tradeId: r.tradeId,
              tradeName: r.tradeName,
              currencyPair: r.currencyPair,
              notional: r.notional,
              dealtCurrency: r.dealtCurrency,
              direction: r.direction,
              spotRate: r.spotRate,
              status: r.status,
              tradeDate: r.tradeDate,
              valueDate: r.valueDate,
            });
            subscriber.complete();
          } catch (e) {
            if (!cancelled) subscriber.error(e);
          }
        })();

        return () => {
          cancelled = true;
        };
      });
    },
  };
}

function createBlotterPort(ws: IWsAdapter): BlotterPort {
  return {
    getTradeStream(): Observable<readonly Trade[]> {
      return new Observable<readonly Trade[]>((subscriber) => {
        const unsub = ws.on(SERVER_MSG.BLOTTER, (payload) => {
          const msg = payload as BlotterMessage;
          subscriber.next(msg.updates);
        });
        ws.send(CLIENT_MSG.SUBSCRIBE_BLOTTER);

        return () => {
          unsub();
        };
      });
    },
  };
}

function createAnalyticsPort(ws: IWsAdapter): AnalyticsPort {
  return {
    getAnalytics(currency: string): Observable<PositionUpdates> {
      return new Observable<PositionUpdates>((subscriber) => {
        const unsub = ws.on(SERVER_MSG.ANALYTICS, (payload) => {
          const dto = payload as AnalyticsDto;
          subscriber.next({
            currentPositions: dto.currentPositions,
            history: dto.history,
          });
        });
        ws.send(CLIENT_MSG.SUBSCRIBE_ANALYTICS, { currency });

        return () => {
          unsub();
        };
      });
    },
  };
}

function createInstrumentPort(ws: IWsAdapter): InstrumentPort {
  return {
    getInstruments(): Observable<readonly Instrument[]> {
      return new Observable<readonly Instrument[]>((subscriber) => {
        const instruments: Instrument[] = [];
        let inSoW = false;

        const unsub = ws.on(SERVER_MSG.INSTRUMENT_EVENT, (payload) => {
          const event = payload as InstrumentEvent;

          switch (event.type) {
            case "startOfStateOfTheWorld":
              instruments.length = 0;
              inSoW = true;
              break;
            case "endOfStateOfTheWorld":
              inSoW = false;
              subscriber.next([...instruments]);
              break;
            case "added":
              instruments.push(event.payload);
              if (!inSoW) subscriber.next([...instruments]);
              break;

            case "removed": {
              const idx = instruments.findIndex((i) => {
                return i.id === event.payload;
              });
              if (idx >= 0) instruments.splice(idx, 1);
              if (!inSoW) subscriber.next([...instruments]);
              break;
            }
          }
        });
        ws.send(CLIENT_MSG.SUBSCRIBE_INSTRUMENTS);

        return () => {
          unsub();
        };
      });
    },
  };
}

function createDealerPort(ws: IWsAdapter): DealerPort {
  return {
    getDealers(): Observable<readonly Dealer[]> {
      return new Observable<readonly Dealer[]>((subscriber) => {
        const dealers: Dealer[] = [];
        let inSoW = false;

        const unsub = ws.on(SERVER_MSG.DEALER_EVENT, (payload) => {
          const event = payload as DealerEvent;

          switch (event.type) {
            case "startOfStateOfTheWorld":
              dealers.length = 0;
              inSoW = true;
              break;
            case "endOfStateOfTheWorld":
              inSoW = false;
              subscriber.next([...dealers]);
              break;
            case "added":
              dealers.push(event.payload);
              if (!inSoW) subscriber.next([...dealers]);
              break;

            case "removed": {
              const idx = dealers.findIndex((d) => {
                return d.id === event.payload;
              });
              if (idx >= 0) dealers.splice(idx, 1);
              if (!inSoW) subscriber.next([...dealers]);
              break;
            }
          }
        });
        ws.send(CLIENT_MSG.SUBSCRIBE_DEALERS);

        return () => {
          unsub();
        };
      });
    },
  };
}

function createWorkflowPort(ws: IWsAdapter): WorkflowPort {
  return {
    events(): Observable<RfqEvent> {
      return new Observable<RfqEvent>((subscriber) => {
        const unsub = ws.on(SERVER_MSG.WORKFLOW_EVENT, (payload) => {
          subscriber.next(payload as WorkflowEvent as RfqEvent);
        });
        ws.send(CLIENT_MSG.SUBSCRIBE_WORKFLOW);

        return () => {
          unsub();
        };
      });
    },

    createRfq(request: CreateRfqRequest): Observable<number> {
      return new Observable<number>((subscriber) => {
        let cancelled = false;

        void (async () => {
          try {
            const resp = (await ws.rpc(CLIENT_MSG.CREATE_RFQ, {
              instrumentId: request.instrumentId,
              dealerIds: request.dealerIds,
              quantity: request.quantity,
              direction: request.direction,
              expirySecs: request.expirySecs,
            })) as RpcResponse<number>;
            if (cancelled) return;

            if (resp.type === "nack") {
              subscriber.error(new Error("Failed to create RFQ"));
              return;
            }

            const rfqId = resp.payload;
            if (rfqId === undefined || rfqId === null)
              throw new Error("ack response missing payload");
            subscriber.next(rfqId);
            subscriber.complete();
          } catch (e) {
            if (!cancelled) subscriber.error(e);
          }
        })();

        return () => {
          cancelled = true;
        };
      });
    },

    cancelRfq(rfqId: number): Observable<void> {
      return new Observable<void>((subscriber) => {
        let cancelled = false;

        void (async () => {
          try {
            const resp = (await ws.rpc(CLIENT_MSG.CANCEL_RFQ, {
              rfqId,
            })) as RpcResponse;
            if (cancelled) return;

            if (resp.type === "nack") {
              subscriber.error(new Error("Failed to cancel RFQ"));
              return;
            }

            subscriber.next(undefined);
            subscriber.complete();
          } catch (e) {
            if (!cancelled) subscriber.error(e);
          }
        })();

        return () => {
          cancelled = true;
        };
      });
    },

    quote(request: QuoteRequest): Observable<void> {
      return new Observable<void>((subscriber) => {
        let cancelled = false;

        void (async () => {
          try {
            const resp = (await ws.rpc(
              CLIENT_MSG.QUOTE,
              request,
            )) as RpcResponse;
            if (cancelled) return;

            if (resp.type === "nack") {
              subscriber.error(new Error("Failed to submit quote"));
              return;
            }

            subscriber.next(undefined);
            subscriber.complete();
          } catch (e) {
            if (!cancelled) subscriber.error(e);
          }
        })();

        return () => {
          cancelled = true;
        };
      });
    },

    pass(quoteId: number): Observable<void> {
      return new Observable<void>((subscriber) => {
        let cancelled = false;

        void (async () => {
          try {
            const resp = (await ws.rpc(CLIENT_MSG.PASS, {
              quoteId,
            })) as RpcResponse;
            if (cancelled) return;

            if (resp.type === "nack") {
              subscriber.error(new Error("Failed to pass on quote"));
              return;
            }

            subscriber.next(undefined);
            subscriber.complete();
          } catch (e) {
            if (!cancelled) subscriber.error(e);
          }
        })();

        return () => {
          cancelled = true;
        };
      });
    },

    accept(quoteId: number): Observable<void> {
      return new Observable<void>((subscriber) => {
        let cancelled = false;

        void (async () => {
          try {
            const resp = (await ws.rpc(CLIENT_MSG.ACCEPT, {
              quoteId,
            })) as RpcResponse;
            if (cancelled) return;

            if (resp.type === "nack") {
              subscriber.error(new Error("Failed to accept quote"));
              return;
            }

            subscriber.next(undefined);
            subscriber.complete();
          } catch (e) {
            if (!cancelled) subscriber.error(e);
          }
        })();

        return () => {
          cancelled = true;
        };
      });
    },
  };
}

function createAdminPort(ws: IWsAdapter): AdminPort {
  return {
    getThroughput(): Observable<number> {
      return new Observable<number>((subscriber) => {
        let cancelled = false;

        void (async () => {
          try {
            const resp = (await ws.rpc(
              CLIENT_MSG.GET_THROUGHPUT,
            )) as RpcResponse<number>;
            if (cancelled) return;

            if (resp.type === "nack") {
              subscriber.error(new Error("Failed to get throughput"));
              return;
            }

            const value = resp.payload;
            if (value === undefined || value === null)
              throw new Error("ack response missing payload");
            subscriber.next(value);
            subscriber.complete();
          } catch (e) {
            if (!cancelled) subscriber.error(e);
          }
        })();

        return () => {
          cancelled = true;
        };
      });
    },

    setThroughput(value: number): Observable<void> {
      return new Observable<void>((subscriber) => {
        let cancelled = false;

        void (async () => {
          try {
            const resp = (await ws.rpc(CLIENT_MSG.SET_THROUGHPUT, {
              value,
            })) as RpcResponse;
            if (cancelled) return;

            if (resp.type === "nack") {
              subscriber.error(new Error("Failed to set throughput"));
              return;
            }

            subscriber.next(undefined);
            subscriber.complete();
          } catch (e) {
            if (!cancelled) subscriber.error(e);
          }
        })();

        return () => {
          cancelled = true;
        };
      });
    },
  };
}

function createMarketDataPort(ws: IWsAdapter): MarketDataPort {
  return {
    watchlist(): Observable<readonly EquityInstrument[]> {
      return new Observable<readonly EquityInstrument[]>((subscriber) => {
        const unsub = ws.on(SERVER_MSG.WATCHLIST, (payload) => {
          subscriber.next(payload as readonly EquityInstrument[]);
        });
        ws.send(CLIENT_MSG.SUBSCRIBE_WATCHLIST);

        return () => {
          unsub();
        };
      });
    },

    quotes(symbol: string): Observable<EquityQuote> {
      return new Observable<EquityQuote>((subscriber) => {
        const unsub = ws.on(SERVER_MSG.EQ_QUOTE, (payload) => {
          const quote = payload as EquityQuote;

          if (quote.symbol === symbol) {
            subscriber.next(quote);
          }
        });
        ws.send(CLIENT_MSG.SUBSCRIBE_EQ_QUOTES, { symbol });

        return () => {
          unsub();
        };
      });
    },

    candles(symbol: string): Observable<readonly Candle[]> {
      return new Observable<readonly Candle[]>((subscriber) => {
        let cancelled = false;

        void (async () => {
          try {
            const resp = (await ws.rpc(CLIENT_MSG.GET_CANDLES, {
              symbol,
            })) as RpcResponse<readonly Candle[]>;
            if (cancelled) return;

            if (resp.type === "nack") {
              subscriber.error(
                new Error(`Failed to get candles for ${symbol}`),
              );
              return;
            }

            const candles = resp.payload;
            if (!candles) throw new Error("ack response missing payload");
            subscriber.next(candles);
            subscriber.complete();
          } catch (e) {
            if (!cancelled) subscriber.error(e);
          }
        })();

        return () => {
          cancelled = true;
        };
      });
    },

    depth(symbol: string): Observable<DepthBook> {
      return new Observable<DepthBook>((subscriber) => {
        const unsub = ws.on(SERVER_MSG.DEPTH, (payload) => {
          const book = payload as DepthBook;

          if (book.symbol === symbol) {
            subscriber.next(book);
          }
        });
        ws.send(CLIENT_MSG.SUBSCRIBE_DEPTH, { symbol });

        return () => {
          unsub();
        };
      });
    },
  };
}

type PlaceOrderAck = { readonly orderId: string };

function createOrderPort(ws: IWsAdapter): OrderPort {
  return {
    place(req: PlaceOrderRequest): Observable<EquityOrder> {
      return new Observable<EquityOrder>((subscriber) => {
        let cancelled = false;
        let unsub: (() => void) | undefined;

        void (async () => {
          try {
            const resp = (await ws.rpc(
              CLIENT_MSG.PLACE_ORDER,
              req,
            )) as RpcResponse<PlaceOrderAck>;
            if (cancelled) return;

            if (resp.type === "nack") {
              subscriber.error(new Error("Failed to place order"));
              return;
            }

            const orderId = resp.payload?.orderId;
            if (!orderId) throw new Error("ack response missing orderId");

            unsub = ws.on(SERVER_MSG.ORDER_LIFECYCLE, (payload) => {
              const order = payload as EquityOrder;

              if (order.id !== orderId) return;

              subscriber.next(order);

              if (
                order.status === "filled" ||
                order.status === "cancelled" ||
                order.status === "rejected"
              ) {
                subscriber.complete();
              }
            });
          } catch (e) {
            if (!cancelled) subscriber.error(e);
          }
        })();

        return () => {
          cancelled = true;
          unsub?.();
        };
      });
    },

    cancel(orderId: string): Observable<void> {
      return new Observable<void>((subscriber) => {
        let cancelled = false;

        void (async () => {
          try {
            const resp = (await ws.rpc(CLIENT_MSG.CANCEL_ORDER, {
              orderId,
            })) as RpcResponse;
            if (cancelled) return;

            if (resp.type === "nack") {
              subscriber.error(new Error("Failed to cancel order"));
              return;
            }

            subscriber.next(undefined);
            subscriber.complete();
          } catch (e) {
            if (!cancelled) subscriber.error(e);
          }
        })();

        return () => {
          cancelled = true;
        };
      });
    },

    orders(): Observable<readonly EquityOrder[]> {
      return new Observable<readonly EquityOrder[]>((subscriber) => {
        const unsub = ws.on(SERVER_MSG.ORDERS, (payload) => {
          subscriber.next(payload as readonly EquityOrder[]);
        });
        ws.send(CLIENT_MSG.SUBSCRIBE_ORDERS);

        return () => {
          unsub();
        };
      });
    },
  };
}

function createPositionPort(ws: IWsAdapter): PositionPort {
  return {
    positions(): Observable<readonly EquityPosition[]> {
      return new Observable<readonly EquityPosition[]>((subscriber) => {
        const unsub = ws.on(SERVER_MSG.POSITIONS, (payload) => {
          subscriber.next(payload as readonly EquityPosition[]);
        });
        ws.send(CLIENT_MSG.SUBSCRIBE_POSITIONS);

        return () => {
          unsub();
        };
      });
    },
  };
}

// ── Factory ─────────────────────────────────────────────────────

export function createWsRealPorts(ws: IWsAdapter): TransportPorts {
  return {
    referenceData: createReferenceDataPort(ws),
    pricing: createPricingPort(ws),
    execution: createExecutionPort(ws),
    blotter: createBlotterPort(ws),
    analytics: createAnalyticsPort(ws),
    instruments: createInstrumentPort(ws),
    dealers: createDealerPort(ws),
    workflow: createWorkflowPort(ws),
    admin: createAdminPort(ws),
    // Browser persistence is independent of the transport.
    preferences: new LocalStoragePreferencesAdapter(),
    marketData: createMarketDataPort(ws),
    orders: createOrderPort(ws),
    positions: createPositionPort(ws),
  };
}
