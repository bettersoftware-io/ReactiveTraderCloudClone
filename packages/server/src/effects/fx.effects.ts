import { map, type Observable } from "rxjs";

import type {
  CurrencyPair,
  PositionUpdates,
  PriceTick,
  Trade,
} from "@rtc/domain";
import type {
  AnalyticsDto,
  BlotterMessage,
  CurrencyPairUpdateDto,
  ExecutionRequestDto,
  ExecutionResponseDto,
  PriceHistoryDto,
  PriceTickDto,
  ReferenceDataMessage,
  TradeDto,
} from "@rtc/shared";
import { CLIENT_MSG, SERVER_MSG } from "@rtc/shared";
import {
  keyedStream,
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

interface CurrencyPayload {
  readonly currency: string;
}

// referenceData — bulk SoW; first emission is the state-of-the-world.
const referenceData$: WsEffect<Ctx> = stream(
  CLIENT_MSG.SUBSCRIBE_REFERENCE_DATA,
  (_payload, ctx) => {
    let isFirst = true;
    return ctx.referenceData.getCurrencyPairs().pipe(
      map((pairs: readonly CurrencyPair[]): Outbound => {
        const updates: CurrencyPairUpdateDto[] = pairs.map((p) => {
          return {
            symbol: p.symbol,
            ratePrecision: p.ratePrecision,
            pipsPosition: p.pipsPosition,
            baseMid: p.baseMid,
            typicalSpreadPips: p.typicalSpreadPips,
          };
        });

        const message: ReferenceDataMessage = {
          updates,
          isStateOfTheWorld: isFirst,
          isStale: false,
        };
        isFirst = false;
        return out(SERVER_MSG.REFERENCE_DATA, message);
      }),
    );
  },
);

// pricing — 1:1 tick → PriceTickDto. Uses keyedStream (not stream): pricing is
// the one subscription the client re-sends for an already-live symbol whenever
// a currency-filter toggle re-mounts a tile/row. keyedStream refcounts per
// symbol, so a duplicate subscribe coalesces into the SAME stream and an
// unsubscribe tears it down at zero — without this the server merged a fresh
// price interval per re-subscribe and ticks accelerated on every toggle.
const pricing$: WsEffect<Ctx> = keyedStream(
  CLIENT_MSG.SUBSCRIBE_PRICING,
  CLIENT_MSG.UNSUBSCRIBE_PRICING,
  (payload) => {
    return (payload as SymbolPayload).symbol;
  },
  (payload, ctx) => {
    const { symbol } = payload as SymbolPayload;
    return ctx.pricing.getPriceUpdates(symbol).pipe(
      map((tick: PriceTick): Outbound => {
        const dto: PriceTickDto = {
          symbol: tick.symbol,
          bid: tick.bid,
          ask: tick.ask,
          mid: tick.mid,
          valueDate: tick.valueDate,
          creationTimestamp: tick.creationTimestamp,
        };
        return out(SERVER_MSG.PRICE_TICK, dto);
      }),
    );
  },
);

// blotter — bulk SoW; first emission is the state-of-the-world.
const blotter$: WsEffect<Ctx> = stream(
  CLIENT_MSG.SUBSCRIBE_BLOTTER,
  (_payload, ctx) => {
    let isFirst = true;
    return ctx.blotter.getTradeStream().pipe(
      map((trades: readonly Trade[]): Outbound => {
        const updates: TradeDto[] = trades.map((t) => {
          return {
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
          };
        });

        const message: BlotterMessage = {
          updates,
          isStateOfTheWorld: isFirst,
          isStale: false,
        };
        isFirst = false;
        return out(SERVER_MSG.BLOTTER, message);
      }),
    );
  },
);

// analytics — 1:1 PositionUpdates → AnalyticsDto.
const analytics$: WsEffect<Ctx> = stream(
  CLIENT_MSG.SUBSCRIBE_ANALYTICS,
  (payload, ctx) => {
    const { currency } = payload as CurrencyPayload;
    return ctx.analytics.getAnalytics(currency).pipe(
      map((pos: PositionUpdates): Outbound => {
        const dto: AnalyticsDto = {
          currentPositions: pos.currentPositions.map((p) => {
            return {
              symbol: p.symbol,
              basePnl: p.basePnl,
              baseTradedAmount: p.baseTradedAmount,
              counterTradedAmount: p.counterTradedAmount,
            };
          }),
          history: pos.history.map((h) => {
            return {
              timestamp: h.timestamp,
              usdPnl: h.usdPnl,
            };
          }),
        };
        return out(SERVER_MSG.ANALYTICS, dto);
      }),
    );
  },
);

// executeTrade — rpc; map Trade → ExecutionResponseDto.
const executeTrade$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.EXECUTE_TRADE,
  SERVER_MSG.EXECUTION_RESPONSE,
  (payload, ctx): Observable<ExecutionResponseDto> => {
    const req = payload as ExecutionRequestDto;
    return ctx.execution
      .executeTrade({
        currencyPair: req.currencyPair,
        spotRate: req.spotRate,
        direction: req.direction,
        notional: req.notional,
        dealtCurrency: req.dealtCurrency,
      })
      .pipe(
        map((t: Trade): ExecutionResponseDto => {
          return {
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
          };
        }),
      );
  },
);

// getPriceHistory — rpc; map PriceTick[] → PriceHistoryDto.
const getPriceHistory$: WsEffect<Ctx> = rpc(
  CLIENT_MSG.GET_PRICE_HISTORY,
  SERVER_MSG.PRICE_HISTORY_RESPONSE,
  (payload, ctx): Observable<PriceHistoryDto> => {
    const { symbol } = payload as SymbolPayload;
    return ctx.pricing.getPriceHistory(symbol).pipe(
      map((prices: readonly PriceTick[]): PriceHistoryDto => {
        return {
          prices: prices.map((p) => {
            return {
              symbol: p.symbol,
              bid: p.bid,
              ask: p.ask,
              mid: p.mid,
              valueDate: p.valueDate,
              creationTimestamp: p.creationTimestamp,
            };
          }),
        };
      }),
    );
  },
);

export const fxEffects: WsEffect<Ctx>[] = [
  referenceData$,
  pricing$,
  blotter$,
  analytics$,
  executeTrade$,
  getPriceHistory$,
];
