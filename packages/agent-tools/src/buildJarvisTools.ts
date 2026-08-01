import { firstValueFrom, type Observable, TimeoutError } from "rxjs";
import { take, timeout } from "rxjs/operators";

import {
  AnalyticsUseCase,
  type CurrencyPair,
  CurrencyPairsUseCase,
  Direction,
  ExecuteTradeUseCase,
  ExecutionStatus,
  formatPnlHeadline,
  PriceStreamUseCase,
  type Trade,
  TradeBlotterUseCase,
} from "@rtc/domain";

import type {
  JarvisConfirmDetails,
  JarvisToolDefinition,
  JarvisToolDeps,
} from "./jarvisToolDefinition.js";

/** Shared read-snapshot budget: every tool but `execute_trade`'s fill leg uses
 * this. The domain simulators never delay a reference/pricing/blotter/
 * analytics/health read meaningfully, so 5s is generous headroom, not a tight
 * race. */
export const JARVIS_TOOL_TIMEOUT_MS = 5_000;

/**
 * Trade EXECUTION gets a much more generous budget than a read snapshot —
 * mirrors `ScriptedJarvisEngine`'s `EXECUTION_TIMEOUT_MS`: `ExecutionSimulator`
 * delays EURJPY fills by a fixed 4s and every other pair uniformly 0-2s, so
 * the tight read-snapshot timeout would misreport a slow-but-real fill as a
 * failure (always, for EURJPY) rather than time out only on a genuinely stuck
 * execution. 30s is "effectively no timeout" for a human-scale
 * confirm-then-execute flow while still bounding a truly hung call.
 */
const EXECUTE_TRADE_TIMEOUT_MS = 30_000;

const DEFAULT_BLOTTER_LIMIT = 20;
const MAX_BLOTTER_LIMIT = 50;
const MAX_HISTORY_POINTS = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readStringField(
  input: Record<string, unknown>,
  field: string,
): string | undefined {
  const value = input[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readFiniteNumberField(
  input: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = input[field];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function readDirectionField(
  input: Record<string, unknown>,
  field: string,
): Direction | undefined {
  const value = input[field];

  if (value === Direction.Buy || value === Direction.Sell) {
    return value;
  }

  return undefined;
}

/** No-arg tools accept `undefined` or `{}` and nothing else. */
function rejectUnexpectedArgs(input: unknown): string | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (isRecord(input) && Object.keys(input).length === 0) {
    return undefined;
  }

  return "Invalid input: this tool takes no arguments.";
}

/** Every read goes through this: take(1) + the shared tool-call timeout
 * budget. A timeout or a thrown port error rejects the returned promise —
 * callers are responsible for turning that into a descriptive string result,
 * per the "never a rejected tool call" rule. */
function snapshotRead<T>(source$: Observable<T>): Promise<T> {
  return firstValueFrom(source$.pipe(take(1), timeout(JARVIS_TOOL_TIMEOUT_MS)));
}

function describeReadFailure(error: unknown): string {
  if (error instanceof TimeoutError) {
    return "the desk didn't respond in time.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "an unknown error occurred.";
}

function findKnownPair(
  pairs: readonly CurrencyPair[],
  symbol: string,
): CurrencyPair | undefined {
  return pairs.find((pair) => {
    return pair.symbol === symbol;
  });
}

function unknownSymbolMessage(symbol: string): string {
  return `Unknown symbol: ${symbol} — use list_currency_pairs to see the available pairs.`;
}

function summarizeTrade(trade: Trade): Record<string, unknown> {
  return {
    tradeId: trade.tradeId,
    currencyPair: trade.currencyPair,
    direction: trade.direction,
    notional: trade.notional,
    dealtCurrency: trade.dealtCurrency,
    spotRate: trade.spotRate,
    status: trade.status,
    tradeDate: trade.tradeDate,
  };
}

function buildListCurrencyPairsTool(
  deps: JarvisToolDeps,
): JarvisToolDefinition {
  return {
    name: "list_currency_pairs",
    description:
      "List every tradeable FX currency pair, with its display precision. " +
      "Call this when the user asks what pairs or instruments are available, " +
      "or before resolving a pair name you're unsure about.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    run: async (input: unknown) => {
      const argError = rejectUnexpectedArgs(input);

      if (argError) {
        return argError;
      }

      try {
        const pairs = await snapshotRead(
          new CurrencyPairsUseCase(deps.referenceData).execute(),
        );

        const table = pairs.map((pair) => {
          return {
            symbol: pair.symbol,
            ratePrecision: pair.ratePrecision,
            pipsPosition: pair.pipsPosition,
          };
        });
        return JSON.stringify({ pairs: table });
      } catch (error) {
        return `Could not list currency pairs: ${describeReadFailure(error)}`;
      }
    },
  };
}

function buildGetPriceTool(deps: JarvisToolDeps): JarvisToolDefinition {
  return {
    name: "get_price",
    description:
      "Get the live bid/ask/mid price and spread for one FX currency pair. " +
      "Call this whenever the user asks for a quote, a rate, or where a pair " +
      "is trading right now.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The currency pair symbol, e.g. EURUSD.",
        },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
    run: async (input: unknown) => {
      if (!isRecord(input)) {
        return 'Invalid input: expected an object with a "symbol" field.';
      }

      const symbol = readStringField(input, "symbol");

      if (!symbol) {
        return 'Invalid input: "symbol" (non-empty string) is required.';
      }

      try {
        const pairs = await snapshotRead(
          new CurrencyPairsUseCase(deps.referenceData).execute(),
        );
        const pair = findKnownPair(pairs, symbol);

        if (!pair) {
          return unknownSymbolMessage(symbol);
        }

        const price = await snapshotRead(
          new PriceStreamUseCase(deps.pricing).execute(pair),
        );
        return JSON.stringify({
          symbol: pair.symbol,
          bid: price.bid,
          ask: price.ask,
          mid: price.mid,
          spread: price.spread,
          movement: price.movementType,
        });
      } catch (error) {
        return `Could not get a price for ${symbol}: ${describeReadFailure(error)}`;
      }
    },
  };
}

/**
 * Reads via `deps.pricing.getPriceHistory` — the SAME port method
 * `ScriptedJarvisEngine.streamMoversReply` snapshots for its history read —
 * rather than the `PriceHistoryUseCase` class: that use case folds *live*
 * ticks into a caller-owned accumulation window (see its own tests), so a
 * one-shot take(1) snapshot of it yields a single-tick window, not a series.
 * The port method returns the already-accumulated buffer directly, which is
 * what a "get me the history" tool call actually needs.
 */
function buildGetPriceHistoryTool(deps: JarvisToolDeps): JarvisToolDefinition {
  return {
    name: "get_price_history",
    description:
      "Get recent price history for one FX currency pair, as timestamp/mid " +
      "points. Call this when the user asks how a pair has moved, its trend, " +
      "or wants a chart-style view rather than the single current price.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "The currency pair symbol, e.g. EURUSD.",
        },
      },
      required: ["symbol"],
      additionalProperties: false,
    },
    run: async (input: unknown) => {
      if (!isRecord(input)) {
        return 'Invalid input: expected an object with a "symbol" field.';
      }

      const symbol = readStringField(input, "symbol");

      if (!symbol) {
        return 'Invalid input: "symbol" (non-empty string) is required.';
      }

      try {
        const pairs = await snapshotRead(
          new CurrencyPairsUseCase(deps.referenceData).execute(),
        );
        const pair = findKnownPair(pairs, symbol);

        if (!pair) {
          return unknownSymbolMessage(symbol);
        }

        const history = await snapshotRead(
          deps.pricing.getPriceHistory(pair.symbol),
        );

        const points = history.slice(-MAX_HISTORY_POINTS).map((tick) => {
          return { timestamp: tick.creationTimestamp, mid: tick.mid };
        });
        return JSON.stringify({ symbol: pair.symbol, points });
      } catch (error) {
        return `Could not get price history for ${symbol}: ${describeReadFailure(error)}`;
      }
    },
  };
}

function buildGetBlotterTool(deps: JarvisToolDeps): JarvisToolDefinition {
  return {
    name: "get_blotter",
    description:
      `List recent trades from the blotter, newest first (default ${DEFAULT_BLOTTER_LIMIT}, ` +
      `max ${MAX_BLOTTER_LIMIT}). Call this when the user asks about recent ` +
      "trades, trade history, or what's on the blotter.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "integer",
          description: `Max trades to return, 1-${MAX_BLOTTER_LIMIT} (default ${DEFAULT_BLOTTER_LIMIT}).`,
        },
      },
      required: [],
      additionalProperties: false,
    },
    run: async (input: unknown) => {
      if (input !== undefined && !isRecord(input)) {
        return "Invalid input: expected an object.";
      }

      let limit = DEFAULT_BLOTTER_LIMIT;

      if (isRecord(input) && "limit" in input) {
        const raw = input.limit;

        if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1) {
          return 'Invalid input: "limit" must be a positive integer.';
        }

        limit = Math.min(raw, MAX_BLOTTER_LIMIT);
      }

      try {
        const trades = await snapshotRead(
          new TradeBlotterUseCase(deps.blotter).execute(),
        );

        const recent = trades.slice(0, limit).map((trade) => {
          return summarizeTrade(trade);
        });
        return JSON.stringify({ trades: recent });
      } catch (error) {
        return `Could not read the blotter: ${describeReadFailure(error)}`;
      }
    },
  };
}

function buildGetAnalyticsTool(deps: JarvisToolDeps): JarvisToolDefinition {
  return {
    name: "get_analytics",
    description:
      "Get current per-pair P&L positions and the session P&L headline. Call " +
      "this when the user asks how they're doing, their P&L, or their " +
      "exposure by pair.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    run: async (input: unknown) => {
      const argError = rejectUnexpectedArgs(input);

      if (argError) {
        return argError;
      }

      try {
        const analytics = await snapshotRead(
          new AnalyticsUseCase(deps.analytics).execute(),
        );

        const positions = analytics.currentPositions.map((position) => {
          return { symbol: position.symbol, basePnl: position.basePnl };
        });

        const total = analytics.currentPositions.reduce((sum, position) => {
          return sum + position.basePnl;
        }, 0);
        return JSON.stringify({
          positions,
          headline: formatPnlHeadline(total),
        });
      } catch (error) {
        return `Could not read analytics: ${describeReadFailure(error)}`;
      }
    },
  };
}

function buildGetServiceHealthTool(deps: JarvisToolDeps): JarvisToolDefinition {
  return {
    name: "get_service_health",
    description:
      "Get the live status of every backend desk service. Call this when " +
      "the user asks whether the desk/systems are healthy or something " +
      "seems down.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    run: async (input: unknown) => {
      const argError = rejectUnexpectedArgs(input);

      if (argError) {
        return argError;
      }

      try {
        const topology = await snapshotRead(deps.serviceHealth.topology$());
        const services = topology.nodes.map((node) => {
          return {
            name: node.name,
            status: node.status,
            health: Math.round(node.health),
          };
        });
        return JSON.stringify({ services });
      } catch (error) {
        return `Could not read service health: ${describeReadFailure(error)}`;
      }
    },
  };
}

function buildExecuteTradeTool(deps: JarvisToolDeps): JarvisToolDefinition {
  return {
    name: "execute_trade",
    description:
      "Execute an FX trade. Call this ONLY when the user explicitly asks to " +
      "buy or sell; a confirmation gate will ask the user to approve before " +
      "anything executes.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Currency pair symbol, e.g. EURUSD.",
        },
        direction: {
          type: "string",
          enum: [Direction.Buy, Direction.Sell],
        },
        notional: {
          type: "number",
          description: "Notional amount, in the pair's base currency.",
        },
      },
      required: ["symbol", "direction", "notional"],
      additionalProperties: false,
    },
    run: async (input: unknown) => {
      if (!isRecord(input)) {
        return "Invalid input: expected an object with symbol, direction and notional.";
      }

      const symbol = readStringField(input, "symbol");
      const direction = readDirectionField(input, "direction");
      const notional = readFiniteNumberField(input, "notional");

      if (!symbol || !direction || notional === undefined || notional <= 0) {
        return 'Invalid input: "symbol" (string), "direction" ("Buy" or "Sell") and "notional" (positive number) are all required.';
      }

      try {
        const pairs = await snapshotRead(
          new CurrencyPairsUseCase(deps.referenceData).execute(),
        );
        const pair = findKnownPair(pairs, symbol);

        if (!pair) {
          return unknownSymbolMessage(symbol);
        }

        const price = await snapshotRead(
          new PriceStreamUseCase(deps.pricing).execute(pair),
        );
        const quotedPrice = direction === Direction.Buy ? price.ask : price.bid;
        const details: JarvisConfirmDetails = {
          symbol: pair.symbol,
          direction,
          notional,
          quotedPrice,
          ratePrecision: pair.ratePrecision,
        };
        const approved = await deps.confirmTrade(details);

        if (!approved) {
          return "The user declined the trade — nothing was executed.";
        }

        const result = await firstValueFrom(
          new ExecuteTradeUseCase(deps.execution)
            .execute({ pair, direction, price, notional })
            .pipe(take(1), timeout(EXECUTE_TRADE_TIMEOUT_MS)),
        );

        if (result.status === ExecutionStatus.Rejected) {
          return "The venue rejected the trade — nothing was executed.";
        }

        return JSON.stringify({
          tradeId: result.trade.tradeId,
          status: result.status,
          currencyPair: result.trade.currencyPair,
          direction: result.trade.direction,
          notional: result.trade.notional,
          dealtCurrency: result.trade.dealtCurrency,
          rate: result.trade.spotRate.toFixed(pair.ratePrecision),
        });
      } catch (error) {
        return `Could not execute the trade for ${symbol}: ${describeReadFailure(error)}`;
      }
    },
  };
}

export function buildJarvisTools(
  deps: JarvisToolDeps,
): readonly JarvisToolDefinition[] {
  return [
    buildListCurrencyPairsTool(deps),
    buildGetPriceTool(deps),
    buildGetPriceHistoryTool(deps),
    buildGetBlotterTool(deps),
    buildGetAnalyticsTool(deps),
    buildGetServiceHealthTool(deps),
    buildExecuteTradeTool(deps),
  ];
}
