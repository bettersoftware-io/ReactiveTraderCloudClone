import type { WebSocket } from "ws";
import type { ServiceContainer } from "../services/serviceContainer.js";
import type {
  CurrencyPairUpdateDto,
  ReferenceDataMessage,
  PriceTickDto,
  TradeDto,
  BlotterMessage,
  AnalyticsDto,
  ExecutionRequestDto,
  ExecutionResponseDto,
  InstrumentDto,
  InstrumentEvent,
  DealerDto,
  DealerEvent,
  WorkflowEvent as WorkflowEventDto,
  CreateRfqRequestDto,
  QuoteRequestDto,
  PassRequestDto,
  AcceptRequestDto,
  CancelRfqRequestDto,
} from "@rtc/shared";
import type { RfqEvent } from "@rtc/domain";
import { firstValueFrom } from "rxjs";
import { CLIENT_MSG, SERVER_MSG, type WsMessage } from "./protocol.js";

type AbortSet = Set<AbortController>;

function send(ws: WebSocket, type: string, payload: unknown, correlationId?: string): void {
  if (ws.readyState !== ws.OPEN) return;
  const msg: WsMessage = { type, payload, correlationId };
  ws.send(JSON.stringify(msg));
}

export function handleConnection(ws: WebSocket, services: ServiceContainer): void {
  const subscriptions: AbortSet = new Set();

  ws.on("message", (data) => {
    let msg: WsMessage;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }

    handleMessage(ws, services, subscriptions, msg);
  });

  ws.on("close", () => {
    for (const ac of subscriptions) ac.abort();
    subscriptions.clear();
  });
}

function handleMessage(
  ws: WebSocket,
  svc: ServiceContainer,
  subs: AbortSet,
  msg: WsMessage,
): void {
  switch (msg.type) {
    // ── FX Subscriptions ──────────────────────────────────
    case CLIENT_MSG.SUBSCRIBE_REFERENCE_DATA:
      streamReferenceData(ws, svc, subs);
      break;

    case CLIENT_MSG.SUBSCRIBE_PRICING:
      streamPricing(ws, svc, subs, msg.payload as { symbol: string });
      break;

    case CLIENT_MSG.SUBSCRIBE_BLOTTER:
      streamBlotter(ws, svc, subs);
      break;

    case CLIENT_MSG.SUBSCRIBE_ANALYTICS:
      streamAnalytics(ws, svc, subs, msg.payload as { currency: string });
      break;

    // ── Credit Subscriptions ──────────────────────────────
    case CLIENT_MSG.SUBSCRIBE_INSTRUMENTS:
      streamInstruments(ws, svc, subs);
      break;

    case CLIENT_MSG.SUBSCRIBE_DEALERS:
      streamDealers(ws, svc, subs);
      break;

    case CLIENT_MSG.SUBSCRIBE_WORKFLOW:
      streamWorkflow(ws, svc, subs);
      break;

    // ── FX RPCs ───────────────────────────────────────────
    case CLIENT_MSG.EXECUTE_TRADE:
      handleExecuteTrade(ws, svc, msg);
      break;

    case CLIENT_MSG.GET_PRICE_HISTORY:
      handleGetPriceHistory(ws, svc, msg);
      break;

    // ── Credit RPCs ───────────────────────────────────────
    case CLIENT_MSG.CREATE_RFQ:
      handleCreateRfq(ws, svc, msg);
      break;

    case CLIENT_MSG.CANCEL_RFQ:
      handleCancelRfq(ws, svc, msg);
      break;

    case CLIENT_MSG.QUOTE:
      handleQuote(ws, svc, msg);
      break;

    case CLIENT_MSG.PASS:
      handlePass(ws, svc, msg);
      break;

    case CLIENT_MSG.ACCEPT:
      handleAccept(ws, svc, msg);
      break;

    // ── Admin ─────────────────────────────────────────────
    case CLIENT_MSG.GET_THROUGHPUT:
      send(ws, SERVER_MSG.THROUGHPUT_RESPONSE, {
        type: "ack",
        payload: svc.throughput.getThroughput(),
      }, msg.correlationId);
      break;

    case CLIENT_MSG.SET_THROUGHPUT:
      handleSetThroughput(ws, svc, msg);
      break;
  }
}

// ── Subscription Helpers ────────────────────────────────────────

function createSubscription(subs: AbortSet): AbortController {
  const ac = new AbortController();
  subs.add(ac);
  return ac;
}

async function iterateStream<T>(
  ws: WebSocket,
  subs: AbortSet,
  iterable: AsyncIterable<T>,
  serverMsgType: string,
  transform: (value: T) => unknown,
): Promise<void> {
  const ac = createSubscription(subs);
  try {
    for await (const value of iterable) {
      if (ac.signal.aborted) break;
      send(ws, serverMsgType, transform(value));
    }
  } catch (e) {
    if (!ac.signal.aborted) console.error(`Stream error [${serverMsgType}]:`, e);
  } finally {
    subs.delete(ac);
  }
}

// ── FX Streams ──────────────────────────────────────────────────

function streamReferenceData(ws: WebSocket, svc: ServiceContainer, subs: AbortSet): void {
  const ac = createSubscription(subs);
  let isFirst = true;
  const sub = svc.referenceData.getCurrencyPairs().subscribe({
    next: (pairs) => {
      if (ac.signal.aborted) return;
      const updates: CurrencyPairUpdateDto[] = pairs.map((p) => ({
        symbol: p.symbol,
        ratePrecision: p.ratePrecision,
        pipsPosition: p.pipsPosition,
      }));
      const message: ReferenceDataMessage = {
        updates,
        isStateOfTheWorld: isFirst,
        isStale: false,
      };
      send(ws, SERVER_MSG.REFERENCE_DATA, message);
      isFirst = false;
    },
    error: (e) => {
      if (!ac.signal.aborted) console.error("ReferenceData stream error:", e);
      subs.delete(ac);
    },
    complete: () => {
      subs.delete(ac);
    },
  });
  ac.signal.addEventListener("abort", () => { sub.unsubscribe(); subs.delete(ac); }, { once: true });
}

function streamPricing(ws: WebSocket, svc: ServiceContainer, subs: AbortSet, payload: { symbol: string }): void {
  const ac = createSubscription(subs);
  const sub = svc.pricing.getPriceUpdates(payload.symbol).subscribe({
    next: (tick) => {
      if (ac.signal.aborted) return;
      const dto: PriceTickDto = {
        symbol: tick.symbol,
        bid: tick.bid,
        ask: tick.ask,
        mid: tick.mid,
        valueDate: tick.valueDate,
        creationTimestamp: tick.creationTimestamp,
      };
      send(ws, SERVER_MSG.PRICE_TICK, dto);
    },
    error: (e) => {
      if (!ac.signal.aborted) console.error("Pricing stream error:", e);
      subs.delete(ac);
    },
    complete: () => {
      subs.delete(ac);
    },
  });
  ac.signal.addEventListener("abort", () => { sub.unsubscribe(); subs.delete(ac); }, { once: true });
}

function streamBlotter(ws: WebSocket, svc: ServiceContainer, subs: AbortSet): void {
  const ac = createSubscription(subs);
  let isFirst = true;
  const sub = svc.blotter.getTradeStream().subscribe({
    next: (trades) => {
      if (ac.signal.aborted) return;
      const updates: TradeDto[] = trades.map((t) => ({
        tradeId: t.tradeId,
        tradeName: t.tradeName,
        currencyPair: t.currencyPair,
        notional: t.notional,
        dealtCurrency: t.dealtCurrency,
        direction: t.direction,
        spotRate: t.spotRate,
        status: t.status,
        tradeDate: t.tradeDate,
        valueDate: t.valueDate,
      }));
      const message: BlotterMessage = {
        updates,
        isStateOfTheWorld: isFirst,
        isStale: false,
      };
      send(ws, SERVER_MSG.BLOTTER, message);
      isFirst = false;
    },
    error: (e) => {
      if (!ac.signal.aborted) console.error("Blotter stream error:", e);
      subs.delete(ac);
    },
    complete: () => {
      subs.delete(ac);
    },
  });
  ac.signal.addEventListener("abort", () => { sub.unsubscribe(); subs.delete(ac); }, { once: true });
}

function streamAnalytics(ws: WebSocket, svc: ServiceContainer, subs: AbortSet, payload: { currency: string }): void {
  const ac = createSubscription(subs);
  const sub = svc.analytics.getAnalytics(payload.currency).subscribe({
    next: (pos) => {
      if (ac.signal.aborted) return;
      const dto: AnalyticsDto = {
        currentPositions: pos.currentPositions.map((p) => ({
          symbol: p.symbol,
          basePnl: p.basePnl,
          baseTradedAmount: p.baseTradedAmount,
          counterTradedAmount: p.counterTradedAmount,
        })),
        history: pos.history.map((h) => ({
          timestamp: h.timestamp,
          usdPnl: h.usdPnl,
        })),
      };
      send(ws, SERVER_MSG.ANALYTICS, dto);
    },
    error: (e) => {
      if (!ac.signal.aborted) console.error("Analytics stream error:", e);
      subs.delete(ac);
    },
    complete: () => {
      subs.delete(ac);
    },
  });
  ac.signal.addEventListener("abort", () => { sub.unsubscribe(); subs.delete(ac); }, { once: true });
}

// ── Credit Streams ──────────────────────────────────────────────

function streamInstruments(ws: WebSocket, svc: ServiceContainer, subs: AbortSet): void {
  const ac = createSubscription(subs);

  // Send SoW markers
  send(ws, SERVER_MSG.INSTRUMENT_EVENT, { type: "startOfStateOfTheWorld" } satisfies InstrumentEvent);

  let isFirst = true;
  const sub = svc.instruments.getInstruments().subscribe({
    next: (instruments) => {
      if (ac.signal.aborted) return;
      for (const inst of instruments) {
        const dto: InstrumentDto = {
          id: inst.id,
          name: inst.name,
          cusip: inst.cusip,
          ticker: inst.ticker,
          maturity: inst.maturity,
          interestRate: inst.interestRate,
          benchmark: inst.benchmark,
        };
        send(ws, SERVER_MSG.INSTRUMENT_EVENT, { type: "added", payload: dto } satisfies InstrumentEvent);
      }
      if (isFirst) {
        send(ws, SERVER_MSG.INSTRUMENT_EVENT, { type: "endOfStateOfTheWorld" } satisfies InstrumentEvent);
        isFirst = false;
      }
    },
    error: (e) => {
      if (!ac.signal.aborted) console.error("Instruments stream error:", e);
      subs.delete(ac);
    },
    complete: () => {
      subs.delete(ac);
    },
  });
  ac.signal.addEventListener("abort", () => { sub.unsubscribe(); subs.delete(ac); }, { once: true });
}

function streamDealers(ws: WebSocket, svc: ServiceContainer, subs: AbortSet): void {
  const ac = createSubscription(subs);

  send(ws, SERVER_MSG.DEALER_EVENT, { type: "startOfStateOfTheWorld" } satisfies DealerEvent);

  let isFirst = true;
  const sub = svc.dealers.getDealers().subscribe({
    next: (dealers) => {
      if (ac.signal.aborted) return;
      for (const dealer of dealers) {
        const dto: DealerDto = { id: dealer.id, name: dealer.name };
        send(ws, SERVER_MSG.DEALER_EVENT, { type: "added", payload: dto } satisfies DealerEvent);
      }
      if (isFirst) {
        send(ws, SERVER_MSG.DEALER_EVENT, { type: "endOfStateOfTheWorld" } satisfies DealerEvent);
        isFirst = false;
      }
    },
    error: (e) => {
      if (!ac.signal.aborted) console.error("Dealers stream error:", e);
      subs.delete(ac);
    },
    complete: () => {
      subs.delete(ac);
    },
  });
  ac.signal.addEventListener("abort", () => { sub.unsubscribe(); subs.delete(ac); }, { once: true });
}

function streamWorkflow(ws: WebSocket, svc: ServiceContainer, subs: AbortSet): void {
  iterateStream(
    ws,
    subs,
    svc.workflow.subscribe(),
    SERVER_MSG.WORKFLOW_EVENT,
    (event: RfqEvent): WorkflowEventDto => {
      switch (event.type) {
        case "startOfStateOfTheWorld":
        case "endOfStateOfTheWorld":
          return { type: event.type };
        case "rfqCreated":
        case "rfqClosed":
          return {
            type: event.type,
            payload: {
              id: event.payload.id,
              instrumentId: event.payload.instrumentId,
              quantity: event.payload.quantity,
              direction: event.payload.direction,
              state: event.payload.state,
              expirySecs: event.payload.expirySecs,
              creationTimestamp: event.payload.creationTimestamp,
            },
          };
        case "quoteCreated":
        case "quoteQuoted":
        case "quotePassed":
        case "quoteAccepted":
          return {
            type: event.type,
            payload: {
              id: event.payload.id,
              rfqId: event.payload.rfqId,
              dealerId: event.payload.dealerId,
              state: event.payload.state,
            },
          };
      }
    },
  );
}

// ── RPC Handlers ────────────────────────────────────────────────

async function handleExecuteTrade(ws: WebSocket, svc: ServiceContainer, msg: WsMessage): Promise<void> {
  try {
    const req = msg.payload as ExecutionRequestDto;
    const trade = await firstValueFrom(svc.execution.executeTrade({
      currencyPair: req.currencyPair,
      spotRate: req.spotRate,
      direction: req.direction,
      notional: req.notional,
      dealtCurrency: req.dealtCurrency,
    }));
    const response: ExecutionResponseDto = {
      tradeId: trade.tradeId,
      tradeName: trade.tradeName,
      currencyPair: trade.currencyPair,
      notional: trade.notional,
      dealtCurrency: trade.dealtCurrency,
      direction: trade.direction,
      spotRate: trade.spotRate,
      status: trade.status,
      tradeDate: trade.tradeDate,
      valueDate: trade.valueDate,
    };
    send(ws, SERVER_MSG.EXECUTION_RESPONSE, { type: "ack", payload: response }, msg.correlationId);
  } catch {
    send(ws, SERVER_MSG.EXECUTION_RESPONSE, { type: "nack" }, msg.correlationId);
  }
}

async function handleGetPriceHistory(ws: WebSocket, svc: ServiceContainer, msg: WsMessage): Promise<void> {
  try {
    const { symbol } = msg.payload as { symbol: string };
    const prices = await firstValueFrom(svc.pricing.getPriceHistory(symbol));
    send(ws, SERVER_MSG.PRICE_HISTORY_RESPONSE, {
      type: "ack",
      payload: { prices: prices.map((p) => ({
        symbol: p.symbol,
        bid: p.bid,
        ask: p.ask,
        mid: p.mid,
        valueDate: p.valueDate,
        creationTimestamp: p.creationTimestamp,
      })) },
    }, msg.correlationId);
  } catch {
    send(ws, SERVER_MSG.PRICE_HISTORY_RESPONSE, { type: "nack" }, msg.correlationId);
  }
}

async function handleCreateRfq(ws: WebSocket, svc: ServiceContainer, msg: WsMessage): Promise<void> {
  try {
    const req = msg.payload as CreateRfqRequestDto;
    const rfqId = await svc.workflow.createRfq({
      instrumentId: req.instrumentId,
      dealerIds: [...req.dealerIds],
      quantity: req.quantity,
      direction: req.direction,
      expirySecs: req.expirySecs,
    });
    send(ws, SERVER_MSG.CREATE_RFQ_RESPONSE, { type: "ack", payload: rfqId }, msg.correlationId);
  } catch {
    send(ws, SERVER_MSG.CREATE_RFQ_RESPONSE, { type: "nack" }, msg.correlationId);
  }
}

async function handleCancelRfq(ws: WebSocket, svc: ServiceContainer, msg: WsMessage): Promise<void> {
  try {
    const { rfqId } = msg.payload as CancelRfqRequestDto;
    await svc.workflow.cancelRfq(rfqId);
    send(ws, SERVER_MSG.CANCEL_RFQ_RESPONSE, { type: "ack" }, msg.correlationId);
  } catch {
    send(ws, SERVER_MSG.CANCEL_RFQ_RESPONSE, { type: "nack" }, msg.correlationId);
  }
}

async function handleQuote(ws: WebSocket, svc: ServiceContainer, msg: WsMessage): Promise<void> {
  try {
    const req = msg.payload as QuoteRequestDto;
    await svc.workflow.quote(req);
    send(ws, SERVER_MSG.QUOTE_RESPONSE, { type: "ack" }, msg.correlationId);
  } catch {
    send(ws, SERVER_MSG.QUOTE_RESPONSE, { type: "nack" }, msg.correlationId);
  }
}

async function handlePass(ws: WebSocket, svc: ServiceContainer, msg: WsMessage): Promise<void> {
  try {
    const { quoteId } = msg.payload as PassRequestDto;
    await svc.workflow.pass(quoteId);
    send(ws, SERVER_MSG.PASS_RESPONSE, { type: "ack" }, msg.correlationId);
  } catch {
    send(ws, SERVER_MSG.PASS_RESPONSE, { type: "nack" }, msg.correlationId);
  }
}

async function handleAccept(ws: WebSocket, svc: ServiceContainer, msg: WsMessage): Promise<void> {
  try {
    const { quoteId } = msg.payload as AcceptRequestDto;
    await svc.workflow.accept(quoteId);
    send(ws, SERVER_MSG.ACCEPT_RESPONSE, { type: "ack" }, msg.correlationId);
  } catch {
    send(ws, SERVER_MSG.ACCEPT_RESPONSE, { type: "nack" }, msg.correlationId);
  }
}

function handleSetThroughput(ws: WebSocket, svc: ServiceContainer, msg: WsMessage): void {
  try {
    const { value } = msg.payload as { value: number };
    svc.throughput.setThroughput(value);
    send(ws, SERVER_MSG.SET_THROUGHPUT_RESPONSE, { type: "ack" }, msg.correlationId);
  } catch {
    send(ws, SERVER_MSG.SET_THROUGHPUT_RESPONSE, { type: "nack" }, msg.correlationId);
  }
}
