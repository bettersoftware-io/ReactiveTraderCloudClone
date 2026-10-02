import { defer, type Observable } from "rxjs";

import {
  CANDLE_TIMEFRAMES,
  type CandleTimeframe,
  Direction,
  type PlaceOrderRequest,
} from "@rtc/domain";
import type {
  CreateRfqRequestDto,
  ExecutionRequestDto,
  QuoteRequestDto,
} from "@rtc/shared";

import { MalformedPayloadError } from "./MalformedPayloadError.js";

export { MalformedPayloadError } from "./MalformedPayloadError.js";

/**
 * S11 — the trust boundary for every non-Jarvis inbound payload.
 *
 * The effects used to cast (`payload as SymbolPayload`); a malformed frame
 * then threw inside the effect and `combineEffects` replaced that effect with
 * `EMPTY` for the rest of the connection. Now an `rpc()` handler calls
 * `requireValid` and lets `MalformedPayloadError` reach `rpc`'s `catchError`
 * (→ nack, which every `portFactory.ts` adapter already handles), while a
 * `stream()` / `keyedStream()` projection returns `EMPTY` for an invalid
 * payload (frame dropped, effect alive; `keyOf` returns `""` so `groupBy`
 * never throws).
 *
 * Every guard here is NEVER stricter than what `portFactory.ts` actually
 * sends — a guard the real client fails is a self-inflicted outage. Bounds
 * are generous ceilings on attacker-chosen strings and arrays, not business
 * validation (the domain simulators still own that).
 */

const MAX_SYMBOL_LENGTH = 16;
const MAX_CURRENCY_LENGTH = 8;
const MAX_ID_LENGTH = 64;
const MAX_CANDLE_PAGE = 2_000;
const MAX_DEALERS_PER_RFQ = 32;

export interface SymbolPayload {
  readonly symbol: string;
}

export interface CurrencyPayload {
  readonly currency: string;
}

export interface CandlesPayload {
  readonly symbol: string;
  readonly timeframe?: CandleTimeframe;
}

export interface CandleHistoryPayload {
  readonly symbol: string;
  readonly timeframe: CandleTimeframe;
  readonly beforeTime: number;
  readonly count: number;
}

export interface OrderIdPayload {
  readonly orderId: string;
}

export interface ThroughputPayload {
  readonly value: number;
}

export interface QuoteIdPayload {
  readonly quoteId: number;
}

export interface RfqIdPayload {
  readonly rfqId: number;
}

/**
 * Narrows `payload` with `guard` or throws `MalformedPayloadError` — for use
 * inside an `rpc()` handler, whose `catchError` turns the throw into a nack.
 * Logs the frame TYPE only: the body is attacker-chosen and must never reach
 * the server log (see `describeMalformedFrame` in jarvis.effects.ts).
 */
export function requireValid<T>(
  frameType: string,
  payload: unknown,
  guard: (value: unknown) => value is T,
): T {
  if (guard(payload)) {
    return payload;
  }

  console.warn(describeMalformedPayload(frameType, "nacking"));
  throw new MalformedPayloadError(frameType);
}

/**
 * The `rpc()` handler shape: validates `payload` with `guard` and runs the
 * handler on the narrowed request, both deferred to subscription time so a
 * malformed payload surfaces as an inner-stream error (→ `rpc`'s nack) and
 * never as a synchronous throw out of the handler (→ dead effect). `run` is
 * never called for a malformed payload.
 */
export function validated<T, R>(
  frameType: string,
  payload: unknown,
  guard: (value: unknown) => value is T,
  run: (request: T) => Observable<R>,
): Observable<R> {
  return defer((): Observable<R> => {
    return run(requireValid(frameType, payload, guard));
  });
}

/** The `console.warn` line for a dropped (stream) or nacked (rpc) frame. */
export function describeMalformedPayload(
  frameType: string,
  verb: "dropping" | "nacking",
): string {
  return `${frameType}: ${verb} malformed payload (body omitted)`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** A non-empty string of at most `max` UTF-16 code units. */
export function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function isDirection(value: unknown): value is Direction {
  return value === Direction.Buy || value === Direction.Sell;
}

function isCandleTimeframe(value: unknown): value is CandleTimeframe {
  return (CANDLE_TIMEFRAMES as readonly unknown[]).includes(value);
}

export function isSymbolPayload(value: unknown): value is SymbolPayload {
  return isRecord(value) && isBoundedString(value.symbol, MAX_SYMBOL_LENGTH);
}

export function isCurrencyPayload(value: unknown): value is CurrencyPayload {
  return (
    isRecord(value) && isBoundedString(value.currency, MAX_CURRENCY_LENGTH)
  );
}

export function isCandlesPayload(value: unknown): value is CandlesPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isBoundedString(value.symbol, MAX_SYMBOL_LENGTH) &&
    (value.timeframe === undefined || isCandleTimeframe(value.timeframe))
  );
}

export function isCandleHistoryPayload(
  value: unknown,
): value is CandleHistoryPayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isBoundedString(value.symbol, MAX_SYMBOL_LENGTH) &&
    isCandleTimeframe(value.timeframe) &&
    isFiniteNumber(value.beforeTime) &&
    isPositiveInteger(value.count, MAX_CANDLE_PAGE)
  );
}

export function isOrderIdPayload(value: unknown): value is OrderIdPayload {
  return isRecord(value) && isBoundedString(value.orderId, MAX_ID_LENGTH);
}

export function isThroughputPayload(
  value: unknown,
): value is ThroughputPayload {
  return isRecord(value) && isFiniteNumber(value.value);
}

export function isQuoteIdPayload(value: unknown): value is QuoteIdPayload {
  return isRecord(value) && isFiniteNumber(value.quoteId);
}

export function isRfqIdPayload(value: unknown): value is RfqIdPayload {
  return isRecord(value) && isFiniteNumber(value.rfqId);
}

export function isExecutionRequestDto(
  value: unknown,
): value is ExecutionRequestDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isBoundedString(value.currencyPair, MAX_SYMBOL_LENGTH) &&
    isFiniteNumber(value.spotRate) &&
    isBoundedString(value.valueDate, MAX_ID_LENGTH) &&
    isDirection(value.direction) &&
    isFiniteNumber(value.notional) &&
    value.notional > 0 &&
    isBoundedString(value.dealtCurrency, MAX_CURRENCY_LENGTH)
  );
}

export function isCreateRfqRequestDto(
  value: unknown,
): value is CreateRfqRequestDto {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isFiniteNumber(value.instrumentId) &&
    Array.isArray(value.dealerIds) &&
    value.dealerIds.length <= MAX_DEALERS_PER_RFQ &&
    value.dealerIds.every(isFiniteNumber) &&
    isFiniteNumber(value.quantity) &&
    value.quantity > 0 &&
    isDirection(value.direction) &&
    isFiniteNumber(value.expirySecs) &&
    value.expirySecs > 0
  );
}

export function isQuoteRequestDto(value: unknown): value is QuoteRequestDto {
  return (
    isRecord(value) &&
    isFiniteNumber(value.quoteId) &&
    isFiniteNumber(value.price)
  );
}

export function isPlaceOrderRequest(
  value: unknown,
): value is PlaceOrderRequest {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isBoundedString(value.symbol, MAX_SYMBOL_LENGTH) &&
    (value.side === "buy" || value.side === "sell") &&
    (value.type === "market" || value.type === "limit") &&
    isFiniteNumber(value.qty) &&
    value.qty > 0 &&
    (value.limitPrice === undefined || isFiniteNumber(value.limitPrice))
  );
}

function isPositiveInteger(value: unknown, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= max
  );
}
