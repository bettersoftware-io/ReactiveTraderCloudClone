import type {
  ReferenceDataPort,
  PricingPort,
  RfqQuoteResult,
  ExecutionPort,
  BlotterPort,
  AnalyticsPort,
  InstrumentPort,
  DealerPort,
  WorkflowPort,
  CurrencyPair,
  PriceTick,
  Trade,
  PositionUpdates,
  Instrument,
  Dealer,
  RfqEvent,
  CreateRfqRequest,
  QuoteRequest,
} from "@rtc/domain";
import { deriveBaseTerm } from "@rtc/domain";
import { Observable } from "rxjs";
import type {
  ReferenceDataMessage,
  PriceTickDto,
  BlotterMessage,
  AnalyticsDto,
  ExecutionRequestDto,
  ExecutionResponseDto,
  InstrumentEvent,
  DealerEvent,
  WorkflowEvent,
  RpcResponse,
  PriceHistoryDto,
} from "@rtc/shared";
import type { WsAdapter } from "./WsAdapter";
import type { Services } from "./mockServiceFactory";

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
} as const;

// ── Helpers ─────────────────────────────────────────────────────

function createAsyncQueue<T>(): {
  iterable: AsyncIterable<T>;
  push: (value: T) => void;
  dispose: () => void;
} {
  let resolve: ((value: IteratorResult<T>) => void) | null = null;
  const queue: T[] = [];
  let done = false;

  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          if (queue.length > 0) {
            return Promise.resolve({ value: queue.shift()!, done: false });
          }
          if (done) return Promise.resolve({ value: undefined, done: true });
          return new Promise((r) => { resolve = r; });
        },
        return(): Promise<IteratorResult<T>> {
          done = true;
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };

  return {
    iterable,
    push(value: T) {
      if (done) return;
      if (resolve) {
        const r = resolve;
        resolve = null;
        r({ value, done: false });
      } else {
        queue.push(value);
      }
    },
    dispose() {
      done = true;
      if (resolve) {
        resolve({ value: undefined, done: true });
      }
    },
  };
}

// ── Port Implementations ────────────────────────────────────────

function createReferenceDataPort(ws: WsAdapter): ReferenceDataPort {
  return {
    getCurrencyPairs(): Observable<readonly CurrencyPair[]> {
      return new Observable<readonly CurrencyPair[]>((subscriber) => {
        const unsub = ws.on(SERVER_MSG.REFERENCE_DATA, (payload) => {
          const msg = payload as ReferenceDataMessage;
          const pairs: CurrencyPair[] = msg.updates.map((dto) => ({
            ...deriveBaseTerm(dto.symbol),
            symbol: dto.symbol,
            ratePrecision: dto.ratePrecision,
            pipsPosition: dto.pipsPosition,
            defaultNotional: dto.symbol === "NZDUSD" ? 10_000_000 : 1_000_000,
          }));
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

function createPricingPort(ws: WsAdapter): PricingPort {
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
        (async () => {
          try {
            const resp = (await ws.rpc(CLIENT_MSG.GET_PRICE_HISTORY, { symbol })) as RpcResponse<PriceHistoryDto>;
            if (cancelled) return;
            if (resp.type === "nack") {
              subscriber.error(new Error("Failed to get price history"));
              return;
            }
            subscriber.next(resp.payload!.prices);
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

    getRfqQuote(symbol: string, pipsPosition: number): Observable<RfqQuoteResult> {
      // No dedicated wire RPC for FX RFQ quotes; derive from the latest price-history tick.
      return new Observable<RfqQuoteResult>((subscriber) => {
        let cancelled = false;
        (async () => {
          try {
            const resp = (await ws.rpc(CLIENT_MSG.GET_PRICE_HISTORY, { symbol })) as RpcResponse<PriceHistoryDto>;
            if (cancelled) return;
            if (resp.type === "nack" || !resp.payload || resp.payload.prices.length === 0) {
              subscriber.error(new Error(`No price available for ${symbol}`));
              return;
            }
            const last = resp.payload.prices[resp.payload.prices.length - 1];
            const priceChange = 0.3 / Math.pow(10, pipsPosition);
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

function createExecutionPort(ws: WsAdapter): ExecutionPort {
  return {
    executeTrade(request): Observable<Trade> {
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
        (async () => {
          try {
            const resp = (await ws.rpc(CLIENT_MSG.EXECUTE_TRADE, dto)) as RpcResponse<ExecutionResponseDto>;
            if (cancelled) return;
            if (resp.type === "nack") {
              subscriber.error(new Error("Trade execution failed"));
              return;
            }
            const r = resp.payload!;
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

function createBlotterPort(ws: WsAdapter): BlotterPort {
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

function createAnalyticsPort(ws: WsAdapter): AnalyticsPort {
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

function createInstrumentPort(ws: WsAdapter): InstrumentPort {
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
              const idx = instruments.findIndex((i) => i.id === event.payload);
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

function createDealerPort(ws: WsAdapter): DealerPort {
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
              const idx = dealers.findIndex((d) => d.id === event.payload);
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

function createWorkflowPort(ws: WsAdapter): WorkflowPort {
  return {
    subscribe(): AsyncIterable<RfqEvent> {
      const q = createAsyncQueue<RfqEvent>();
      const unsub = ws.on(SERVER_MSG.WORKFLOW_EVENT, (payload) => {
        q.push(payload as WorkflowEvent as RfqEvent);
      });
      ws.send(CLIENT_MSG.SUBSCRIBE_WORKFLOW);
      const original = q.iterable;
      return {
        [Symbol.asyncIterator]() {
          const iter = original[Symbol.asyncIterator]();
          return {
            next: () => iter.next(),
            return() {
              unsub();
              q.dispose();
              return iter.return!();
            },
          };
        },
      };
    },

    async createRfq(request: CreateRfqRequest): Promise<number> {
      const resp = await ws.rpc(CLIENT_MSG.CREATE_RFQ, {
        instrumentId: request.instrumentId,
        dealerIds: request.dealerIds,
        quantity: request.quantity,
        direction: request.direction,
        expirySecs: request.expirySecs,
      }) as RpcResponse<number>;
      if (resp.type === "nack") throw new Error("Failed to create RFQ");
      return resp.payload!;
    },

    async cancelRfq(rfqId: number): Promise<void> {
      const resp = await ws.rpc(CLIENT_MSG.CANCEL_RFQ, { rfqId }) as RpcResponse;
      if (resp.type === "nack") throw new Error("Failed to cancel RFQ");
    },

    async quote(request: QuoteRequest): Promise<void> {
      const resp = await ws.rpc(CLIENT_MSG.QUOTE, request) as RpcResponse;
      if (resp.type === "nack") throw new Error("Failed to submit quote");
    },

    async pass(quoteId: number): Promise<void> {
      const resp = await ws.rpc(CLIENT_MSG.PASS, { quoteId }) as RpcResponse;
      if (resp.type === "nack") throw new Error("Failed to pass on quote");
    },

    async accept(quoteId: number): Promise<void> {
      const resp = await ws.rpc(CLIENT_MSG.ACCEPT, { quoteId }) as RpcResponse;
      if (resp.type === "nack") throw new Error("Failed to accept quote");
    },
  };
}

// ── Factory ─────────────────────────────────────────────────────

export function createRealServices(ws: WsAdapter): Services {
  return {
    referenceData: createReferenceDataPort(ws),
    pricing: createPricingPort(ws),
    execution: createExecutionPort(ws),
    blotter: createBlotterPort(ws),
    analytics: createAnalyticsPort(ws),
    instruments: createInstrumentPort(ws),
    dealers: createDealerPort(ws),
    workflow: createWorkflowPort(ws),
  };
}
