import { NEVER, of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type AnalyticsPort,
  Direction,
  ExecutionSimulator,
  type PositionUpdates,
  type PricingPort,
  PricingSimulator,
  type ReferenceDataPort,
  ReferenceDataSimulator,
  ServiceTopologySimulator,
  TradeStoreSimulator,
} from "@rtc/domain";

import {
  buildJarvisTools,
  JARVIS_TOOL_TIMEOUT_MS,
} from "./buildJarvisTools.js";
import type { JarvisToolDeps } from "./jarvisToolDefinition.js";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildJarvisTools", () => {
  it("returns exactly the seven desk tools, uniquely named", () => {
    const { deps } = buildDeps();
    const tools = buildJarvisTools(deps);

    expect(tools).toHaveLength(7);
    const names = tools.map((tool) => {
      return tool.name;
    });
    expect(new Set(names).size).toBe(7);
    expect(names).toEqual([
      "list_currency_pairs",
      "get_price",
      "get_price_history",
      "get_blotter",
      "get_analytics",
      "get_service_health",
      "execute_trade",
    ]);
  });

  it("every schema declares additionalProperties: false and a required array", () => {
    const { deps } = buildDeps();
    const tools = buildJarvisTools(deps);

    for (const tool of tools) {
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(Array.isArray(tool.inputSchema.required)).toBe(true);
    }
  });

  describe("list_currency_pairs", () => {
    it("resolves the reference-data snapshot (1s simulator delay) into a symbol/precision table", async () => {
      const { deps } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "list_currency_pairs");

      const resultPromise = tool.run(undefined);
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await resultPromise;

      const parsed = JSON.parse(result) as ListCurrencyPairsResult;
      expect(parsed.pairs.length).toBeGreaterThan(0);
      const eurusd = parsed.pairs.find((pair) => {
        return pair.symbol === "EURUSD";
      });
      expect(eurusd).toEqual({
        symbol: "EURUSD",
        ratePrecision: 5,
        pipsPosition: 4,
      });
    });

    it("rejects unexpected arguments with a descriptive string", async () => {
      const { deps } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "list_currency_pairs");

      const result = await tool.run({ unexpected: true });

      expect(result).toBe("Invalid input: this tool takes no arguments.");
    });
  });

  describe("get_price", () => {
    it("looks up the pair, then reports bid/ask/mid/spread", async () => {
      const { deps } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "get_price");

      const resultPromise = tool.run({ symbol: "EURUSD" });
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await resultPromise;

      const parsed = JSON.parse(result) as GetPriceResult;
      expect(parsed.symbol).toBe("EURUSD");
      expect(parsed.ask).toBeGreaterThan(parsed.bid);
      expect(parsed.mid).toBeGreaterThan(0);
    });

    it("an unknown symbol resolves to a descriptive error string, never a rejection", async () => {
      const { deps } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "get_price");

      const resultPromise = tool.run({ symbol: "XYZUSD" });
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await resultPromise;

      expect(result).toBe(
        "Unknown symbol: XYZUSD — use list_currency_pairs to see the available pairs.",
      );
    });

    it("malformed input resolves to an error string without touching any port", async () => {
      const { deps } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "get_price");

      const result = await tool.run({ symbol: 42 });

      expect(result).toBe(
        'Invalid input: "symbol" (non-empty string) is required.',
      );
    });

    it("a snapshot that never resolves times out into an error string", async () => {
      const { deps } = buildDeps({
        referenceData: {
          getCurrencyPairs: () => {
            return NEVER;
          },
        },
      });
      const tool = findTool(buildJarvisTools(deps), "get_price");

      const resultPromise = tool.run({ symbol: "EURUSD" });
      await vi.advanceTimersByTimeAsync(JARVIS_TOOL_TIMEOUT_MS + 100);
      const result = await resultPromise;

      expect(result).toBe(
        "Could not get a price for EURUSD: the desk didn't respond in time.",
      );
    });
  });

  describe("get_price_history", () => {
    it("returns a capped timestamp/mid series", async () => {
      const { deps } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "get_price_history");

      const resultPromise = tool.run({ symbol: "EURUSD" });
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await resultPromise;

      const parsed = JSON.parse(result) as GetPriceHistoryResult;
      expect(parsed.symbol).toBe("EURUSD");
      expect(parsed.points.length).toBeGreaterThan(0);
      expect(parsed.points.length).toBeLessThanOrEqual(100);
      expect(typeof parsed.points[0]?.timestamp).toBe("number");
      expect(typeof parsed.points[0]?.mid).toBe("number");
    });

    it("an unknown symbol resolves to a descriptive error string", async () => {
      const { deps } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "get_price_history");

      const resultPromise = tool.run({ symbol: "XYZUSD" });
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await resultPromise;

      expect(result).toBe(
        "Unknown symbol: XYZUSD — use list_currency_pairs to see the available pairs.",
      );
    });
  });

  describe("get_blotter", () => {
    it("defaults to newest-first, limit 20 — the five seeded trades", async () => {
      const { deps } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "get_blotter");

      const result = await tool.run(undefined);

      const parsed = JSON.parse(result) as GetBlotterResult;
      const tradeIds = parsed.trades.map((trade) => {
        return trade.tradeId;
      });
      expect(tradeIds).toEqual([1042, 1041, 1040, 1039, 1038]);
    });

    it("honours a smaller limit", async () => {
      const { deps } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "get_blotter");

      const result = await tool.run({ limit: 2 });

      const parsed = JSON.parse(result) as GetBlotterResult;
      const tradeIds = parsed.trades.map((trade) => {
        return trade.tradeId;
      });
      expect(tradeIds).toEqual([1042, 1041]);
    });

    it("clamps a limit above the max", async () => {
      const { deps } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "get_blotter");

      const result = await tool.run({ limit: 9_999 });

      const parsed = JSON.parse(result) as GetBlotterResult;
      expect(parsed.trades).toHaveLength(5);
    });

    it("rejects a non-integer limit with a descriptive string", async () => {
      const { deps } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "get_blotter");

      const result = await tool.run({ limit: "lots" });

      expect(result).toBe('Invalid input: "limit" must be a positive integer.');
    });
  });

  describe("get_analytics", () => {
    it("reports per-pair basePnl and the formatted headline total", async () => {
      const { deps } = buildDeps({
        analytics: {
          getAnalytics: () => {
            return of<PositionUpdates>({
              currentPositions: [
                {
                  symbol: "EURUSD",
                  basePnl: 150_000,
                  baseTradedAmount: 0,
                  counterTradedAmount: 0,
                },
                {
                  symbol: "GBPUSD",
                  basePnl: -25_000,
                  baseTradedAmount: 0,
                  counterTradedAmount: 0,
                },
              ],
              history: [],
            });
          },
        },
      });
      const tool = findTool(buildJarvisTools(deps), "get_analytics");

      const result = await tool.run(undefined);

      const parsed = JSON.parse(result) as GetAnalyticsResult;
      expect(parsed.positions).toEqual([
        { symbol: "EURUSD", basePnl: 150_000 },
        { symbol: "GBPUSD", basePnl: -25_000 },
      ]);
      expect(parsed.headline).toBe("+$125.0k");
    });
  });

  describe("get_service_health", () => {
    it("reports every service's status on the first (pre-drift) snapshot", async () => {
      const { deps } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "get_service_health");

      const result = await tool.run(undefined);

      const parsed = JSON.parse(result) as GetServiceHealthResult;
      expect(parsed.services).toHaveLength(7);
      const byName = new Map(
        parsed.services.map((service) => {
          return [service.name, service];
        }),
      );
      expect(byName.get("pricing")).toEqual({
        name: "pricing",
        status: "ok",
        health: 99,
      });
      expect(byName.get("blotter")).toEqual({
        name: "blotter",
        status: "degraded",
        health: 93,
      });
    });
  });

  describe("execute_trade", () => {
    it("rejects malformed input before touching any port", async () => {
      const { deps, confirmTrade } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "execute_trade");

      const result = await tool.run({ symbol: "EURUSD" });

      expect(result).toMatch(/^Invalid input:/);
      expect(confirmTrade).not.toHaveBeenCalled();
    });

    it("an unknown symbol resolves to a descriptive error string", async () => {
      const { deps, confirmTrade } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "execute_trade");

      const resultPromise = tool.run({
        symbol: "XYZUSD",
        direction: Direction.Buy,
        notional: 1_000_000,
      });
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await resultPromise;

      expect(result).toBe(
        "Unknown symbol: XYZUSD — use list_currency_pairs to see the available pairs.",
      );
      expect(confirmTrade).not.toHaveBeenCalled();
    });

    it("a declined confirmation reports the decline and never calls the execution port", async () => {
      const executionSpy = vi.fn();
      const { deps } = buildDeps({
        execution: { executeTrade: executionSpy },
        confirmTrade: async () => {
          return false;
        },
      });
      const tool = findTool(buildJarvisTools(deps), "execute_trade");

      const resultPromise = tool.run({
        symbol: "EURUSD",
        direction: Direction.Sell,
        notional: 2_000_000,
      });
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await resultPromise;

      expect(result).toBe(
        "The user declined the trade — nothing was executed.",
      );
      expect(executionSpy).not.toHaveBeenCalled();
    });

    it("an approved confirmation executes through ExecutionPort (0-2s EURUSD fill) and lands the trade on the blotter", async () => {
      const { deps } = buildDeps();
      const tool = findTool(buildJarvisTools(deps), "execute_trade");

      const resultPromise = tool.run({
        symbol: "EURUSD",
        direction: Direction.Buy,
        notional: 1_000_000,
      });
      // 1s reference-data delay + up to 2s execution fill.
      await vi.advanceTimersByTimeAsync(3_500);
      const result = await resultPromise;

      const parsed = JSON.parse(result) as ExecuteTradeResult;
      expect(parsed.status).toBe("Done");
      expect(parsed.currencyPair).toBe("EURUSD");

      const blotterTool = findTool(buildJarvisTools(deps), "get_blotter");
      const blotterResult = await blotterTool.run(undefined);
      const blotter = JSON.parse(blotterResult) as GetBlotterResult;
      expect(
        blotter.trades.some((trade) => {
          return trade.tradeId === parsed.tradeId;
        }),
      ).toBe(true);
    });

    it("a price snapshot that never resolves times out into an error string", async () => {
      const { deps } = buildDeps({
        pricing: {
          getPriceUpdates: () => {
            return NEVER;
          },
          getPriceHistory: () => {
            return NEVER;
          },
          getRfqQuote: () => {
            return NEVER;
          },
        },
      });
      const tool = findTool(buildJarvisTools(deps), "execute_trade");

      const resultPromise = tool.run({
        symbol: "EURUSD",
        direction: Direction.Buy,
        notional: 1_000_000,
      });
      await vi.advanceTimersByTimeAsync(JARVIS_TOOL_TIMEOUT_MS + 1_100);
      const result = await resultPromise;

      expect(result).toBe(
        "Could not execute the trade for EURUSD: the desk didn't respond in time.",
      );
    });
  });
});

interface CurrencyPairSummary {
  readonly symbol: string;
  readonly ratePrecision: number;
  readonly pipsPosition: number;
}

interface ListCurrencyPairsResult {
  readonly pairs: readonly CurrencyPairSummary[];
}

interface GetPriceResult {
  readonly symbol: string;
  readonly bid: number;
  readonly ask: number;
  readonly mid: number;
}

interface GetPriceHistoryResult {
  readonly symbol: string;
  readonly points: readonly { timestamp: number; mid: number }[];
}

interface GetBlotterResult {
  readonly trades: readonly { tradeId: number }[];
}

interface GetAnalyticsResult {
  readonly positions: readonly { symbol: string; basePnl: number }[];
  readonly headline: string;
}

interface GetServiceHealthResult {
  readonly services: readonly {
    name: string;
    status: string;
    health: number;
  }[];
}

interface ExecuteTradeResult {
  readonly tradeId: number;
  readonly status: string;
  readonly currencyPair: string;
}

interface BuiltDeps {
  readonly deps: JarvisToolDeps;
  readonly confirmTrade: ReturnType<typeof vi.fn>;
}

/** Builds real-simulator deps (mirroring the ScriptedJarvisEngine test
 * harness's use of `of(...)` stubs, but here mostly wired to the actual
 * domain simulators so the delay-shaped happy paths — ReferenceDataSimulator's
 * fixed 1s delay, ExecutionSimulator's 0-2s EURUSD fill — are exercised for
 * real under fake timers). Individual ports can be swapped per test (e.g. to
 * force a timeout with NEVER, or to control confirmTrade). */
function buildDeps(overrides: Partial<JarvisToolDeps> = {}): BuiltDeps {
  const referenceData: ReferenceDataPort = new ReferenceDataSimulator();
  const pricing: PricingPort = new PricingSimulator();
  const execution = new ExecutionSimulator();
  const blotter = new TradeStoreSimulator(execution);
  const analytics: AnalyticsPort = {
    getAnalytics: () => {
      return of<PositionUpdates>({
        currentPositions: [],
        history: [],
      });
    },
  };
  const serviceHealth = new ServiceTopologySimulator();
  const confirmTrade = vi.fn(async () => {
    return true;
  });

  return {
    deps: {
      referenceData,
      pricing,
      blotter,
      analytics,
      execution,
      serviceHealth,
      confirmTrade,
      ...overrides,
    },
    confirmTrade,
  };
}

function findTool(
  tools: readonly ReturnType<typeof buildJarvisTools>[number][],
  name: string,
): ReturnType<typeof buildJarvisTools>[number] {
  const tool = tools.find((candidate) => {
    return candidate.name === name;
  });

  if (!tool) {
    throw new Error(`fixture error: no tool named ${name}`);
  }

  return tool;
}
