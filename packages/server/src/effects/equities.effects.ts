import {
  catchError,
  map,
  merge,
  mergeMap,
  type Observable,
  of,
  shareReplay,
  take,
} from "rxjs";

import type {
  Candle,
  DepthBook,
  EquityInstrument,
  EquityOrder,
  EquityPosition,
  EquityQuote,
  PlaceOrderRequest,
} from "@rtc/domain";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import {
  type Inbound,
  matchType,
  type Outbound,
  out,
  rpc,
  stream,
  type WsEffect,
} from "@rtc/ws-effects";

import type { Ctx } from "./context.js";

interface SymbolPayload {
  readonly symbol: string;
}

interface OrderIdPayload {
  readonly orderId: string;
}

// watchlist — domain type sent directly; no DTO mapping.
const watchlist$: WsEffect<Ctx> = stream(
  CLIENT_MSG.SUBSCRIBE_WATCHLIST,
  (_payload, ctx) => {
    return ctx.marketData.watchlist().pipe(
      map((list: readonly EquityInstrument[]) => {
        return out(SERVER_MSG.WATCHLIST, list);
      }),
    );
  },
);

// eqQuotes — 1:1 tick → EquityQuote, forwarded as-is.
const eqQuotes$: WsEffect<Ctx> = stream(
  CLIENT_MSG.SUBSCRIBE_EQ_QUOTES,
  (payload, ctx) => {
    const { symbol } = payload as SymbolPayload;
    return ctx.marketData.quotes(symbol).pipe(
      map((quote: EquityQuote) => {
        return out(SERVER_MSG.EQ_QUOTE, quote);
      }),
    );
  },
);

// depth — 1:1 book update → DepthBook, forwarded as-is.
const depth$: WsEffect<Ctx> = stream(
  CLIENT_MSG.SUBSCRIBE_DEPTH,
  (payload, ctx) => {
    const { symbol } = payload as SymbolPayload;
    return ctx.marketData.depth(symbol).pipe(
      map((book: DepthBook) => {
        return out(SERVER_MSG.DEPTH, book);
      }),
    );
  },
);

// orders — the full order book, forwarded as-is.
const orders$: WsEffect<Ctx> = stream(
  CLIENT_MSG.SUBSCRIBE_ORDERS,
  (_payload, ctx) => {
    return ctx.orders.orders().pipe(
      map((orders: readonly EquityOrder[]) => {
        return out(SERVER_MSG.ORDERS, orders);
      }),
    );
  },
);

// positions — the full position book, forwarded as-is.
const positions$: WsEffect<Ctx> = stream(
  CLIENT_MSG.SUBSCRIBE_POSITIONS,
  (_payload, ctx) => {
    return ctx.positions.positions().pipe(
      map((positions: readonly EquityPosition[]) => {
        return out(SERVER_MSG.POSITIONS, positions);
      }),
    );
  },
);

// getCandles — rpc; ack payload is the candles array, forwarded as-is.
const getCandles$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.GET_CANDLES,
  SERVER_MSG.CANDLES_RESPONSE,
  (payload, ctx): Observable<readonly Candle[]> => {
    const { symbol } = payload as SymbolPayload;
    return ctx.marketData.candles(symbol);
  },
);

// cancelOrder — rpc; void ack.
const cancelOrder$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.CANCEL_ORDER,
  SERVER_MSG.CANCEL_ORDER_RESPONSE,
  (payload, ctx): Observable<void> => {
    const { orderId } = payload as OrderIdPayload;
    return ctx.orders.cancel(orderId);
  },
);

// placeOrder — raw primitive: ack with { orderId } AND stream ORDER_LIFECYCLE
// frames from the SAME underlying order-placement observable.
function placeOrder$(in$: Observable<Inbound>, ctx: Ctx): Observable<Outbound> {
  return in$.pipe(
    matchType(CLIENT_MSG.PLACE_ORDER),
    mergeMap((msg) => {
      // refCount:true releases the sim subscription on socket close (via
      // createWsListener's takeUntil); bufferSize:1 lets the ack's take(1)
      // and the lifecycle stream both see the first emission, even in the
      // synchronous case where merge subscribes ack$ before stream$.
      const lifecycle$ = ctx.orders
        .place(msg.payload as PlaceOrderRequest)
        .pipe(shareReplay({ bufferSize: 1, refCount: true }));
      const ack$ = lifecycle$.pipe(
        take(1),
        map((order: EquityOrder) => {
          return out(
            SERVER_MSG.PLACE_ORDER_RESPONSE,
            { type: "ack", payload: { orderId: order.id } },
            msg.correlationId,
          );
        }),
      );
      const stream$ = lifecycle$.pipe(
        map((order: EquityOrder) => {
          return out(SERVER_MSG.ORDER_LIFECYCLE, order);
        }),
      );
      // Per-message error isolation (parity with rpc()'s nack path — the raw
      // primitive has no built-in catchError). An error placing the order
      // before the ack becomes a nack, so the client's rpc rejects rather
      // than hangs; a late error (after the ack) is a no-op for the client,
      // which already resolved on correlationId. Either way the error is
      // contained to this message and placeOrder$ keeps serving later orders.
      return merge(ack$, stream$).pipe(
        catchError((err: unknown) => {
          console.error("ws-effects: placeOrder effect error", err);
          return of(
            out(
              SERVER_MSG.PLACE_ORDER_RESPONSE,
              { type: "nack" },
              msg.correlationId,
            ),
          );
        }),
      );
    }),
  );
}

export const equitiesEffects: WsEffect<Ctx>[] = [
  watchlist$,
  eqQuotes$,
  depth$,
  orders$,
  positions$,
  getCandles$,
  cancelOrder$,
  placeOrder$,
];
