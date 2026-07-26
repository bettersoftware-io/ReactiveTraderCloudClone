import { NEVER, type Observable, of } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type AnalyticsPort,
  type BlotterPort,
  type CurrencyPair,
  Direction,
  type ExecutionPort,
  type ExecutionRequest,
  KNOWN_CURRENCY_PAIRS,
  type PositionUpdates,
  type PriceTick,
  type PricingPort,
  type ReferenceDataPort,
  type Trade,
  TradeStatus,
} from "@rtc/domain";

import type { JarvisEvent } from "../jarvisPort";
import {
  ScriptedJarvisAdapter,
  type ScriptedJarvisDeps,
} from "../ScriptedJarvisAdapter";

const EURUSD = findPair("EURUSD");

const CURRENT_TICK: PriceTick = {
  symbol: "EURUSD",
  bid: 1.0841,
  ask: 1.0843,
  mid: 1.0842,
  valueDate: "2026-07-27",
  creationTimestamp: 1,
};

const SESSION_START_TICK: PriceTick = {
  ...CURRENT_TICK,
  bid: 1.0829,
  ask: 1.0831,
  mid: 1.083,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ScriptedJarvisAdapter", () => {
  it("a quote turn emits toolEvent running -> chunked deltas reassembling the full reply -> done", async () => {
    const { deps } = buildDeps({ instantReveal$: of(false) });
    const adapter = new ScriptedJarvisAdapter(deps);

    const { events, done } = runTurn(adapter, "where is EURUSD?");
    await vi.advanceTimersByTimeAsync(5_000);
    await done;

    expect(events[0]).toEqual({
      type: "toolEvent",
      tool: "quote",
      status: "running",
    });
    expect(
      events.some((e) => {
        return e.type === "toolEvent" && e.status === "done";
      }),
    ).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(fullText(events)).toBe(
      "EURUSD is trading at 1.0842, up 12 pips since the start of the session. " +
        "Spread 2 pips; short-term momentum is positive. Anything else, sir?",
    );
  });

  it("instantReveal -> exactly one delta", async () => {
    const { deps } = buildDeps({ instantReveal$: of(true) });
    const adapter = new ScriptedJarvisAdapter(deps);

    const { events, done } = runTurn(adapter, "hi");
    await done;

    const deltas = events.filter((e) => {
      return e.type === "delta";
    });
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toEqual({
      type: "delta",
      text:
        "At your service, sir. Markets, a desk briefing, or an execution — " +
        "simply say the word.",
    });
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("a trade turn emits confirmRequest, then approves and executes through ExecutionPort, reporting the fill", async () => {
    const trade: Trade = {
      tradeId: 1,
      tradeName: "t1",
      currencyPair: "EURUSD",
      notional: 5_000_000,
      dealtCurrency: "EUR",
      direction: Direction.Buy,
      spotRate: 1.0843,
      status: TradeStatus.Done,
      tradeDate: "2026-07-27",
      valueDate: "2026-07-29",
    };

    const { deps, executeTradeSpy } = buildDeps({
      executeTrade: () => {
        return of(trade);
      },
    });
    const adapter = new ScriptedJarvisAdapter(deps);

    const { events, done } = runTurn(adapter, "buy 5M EURUSD");
    await Promise.resolve();
    await Promise.resolve();

    const confirmRequest = events.find((e) => {
      return e.type === "confirmRequest";
    });
    expect(confirmRequest).toMatchObject({
      type: "confirmRequest",
      symbol: "EURUSD",
      direction: Direction.Buy,
      notional: 5_000_000,
      quotedPrice: 1.0843,
    });

    if (confirmRequest?.type !== "confirmRequest") {
      throw new Error("expected a confirmRequest event");
    }

    adapter.confirm(confirmRequest.confirmationId, true);
    await done;

    expect(executeTradeSpy).toHaveBeenCalledWith({
      currencyPair: "EURUSD",
      spotRate: 1.0843,
      direction: Direction.Buy,
      notional: 5_000_000,
      dealtCurrency: "EUR",
    });
    expect(fullText(events)).toBe(
      "Very good, sir. Bought 5,000,000 EUR at 1.0843 — the trade is on your blotter.",
    );
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("declining a confirmation reports the decline and never calls ExecutionPort", async () => {
    const { deps, executeTradeSpy } = buildDeps();
    const adapter = new ScriptedJarvisAdapter(deps);

    const { events, done } = runTurn(adapter, "sell 2M eurusd");
    await Promise.resolve();
    await Promise.resolve();

    const confirmRequest = events.find((e) => {
      return e.type === "confirmRequest";
    });

    if (confirmRequest?.type !== "confirmRequest") {
      throw new Error("expected a confirmRequest event");
    }

    adapter.confirm(confirmRequest.confirmationId, false);
    await done;

    expect(executeTradeSpy).not.toHaveBeenCalled();
    expect(fullText(events)).toBe(
      "Understood, sir — standing down. Nothing was executed.",
    );
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("a snapshot that never resolves times out into a single error event", async () => {
    const { deps } = buildDeps({ referenceData$: NEVER });
    const adapter = new ScriptedJarvisAdapter(deps);

    const { events, done } = runTurn(adapter, "hi");
    await vi.advanceTimersByTimeAsync(2_100);
    await done;

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("error");
  });
});

function findPair(symbol: string): CurrencyPair {
  const pair = KNOWN_CURRENCY_PAIRS.find((p) => {
    return p.symbol === symbol;
  });

  if (!pair) {
    throw new Error(`fixture error: ${symbol} not in KNOWN_CURRENCY_PAIRS`);
  }

  return pair;
}

interface TestPortsOptions {
  readonly pairs?: readonly CurrencyPair[];
  readonly currentTick?: PriceTick;
  readonly history?: Record<string, readonly PriceTick[]>;
  readonly trades?: readonly Trade[];
  readonly positions?: PositionUpdates;
  readonly executeTrade?: (request: ExecutionRequest) => Observable<Trade>;
  readonly referenceData$?: Observable<readonly CurrencyPair[]>;
  readonly instantReveal$?: Observable<boolean>;
}

interface BuiltDeps {
  readonly deps: ScriptedJarvisDeps;
  readonly executeTradeSpy: ReturnType<typeof vi.fn>;
}

function buildDeps(options: TestPortsOptions = {}): BuiltDeps {
  const pairs = options.pairs ?? [EURUSD];
  const history = options.history ?? {
    EURUSD: [SESSION_START_TICK, CURRENT_TICK],
  };

  const executeTradeSpy = vi.fn(
    options.executeTrade ??
      ((): Observable<Trade> => {
        throw new Error("executeTrade should not be called in this test");
      }),
  );

  const referenceData: ReferenceDataPort = {
    getCurrencyPairs: () => {
      return options.referenceData$ ?? of(pairs);
    },
  };

  const pricing: PricingPort = {
    getPriceUpdates: () => {
      return of(options.currentTick ?? CURRENT_TICK);
    },
    getPriceHistory: (symbol: string) => {
      return of(history[symbol] ?? []);
    },
    getRfqQuote: () => {
      return of({ bid: 0, ask: 0, mid: 0 });
    },
  };

  const blotter: BlotterPort = {
    getTradeStream: () => {
      return of(options.trades ?? []);
    },
  };

  const analytics: AnalyticsPort = {
    getAnalytics: () => {
      return of(
        options.positions ?? {
          currentPositions: [],
          history: [],
        },
      );
    },
  };

  const execution: ExecutionPort = {
    executeTrade: executeTradeSpy,
  };

  return {
    deps: {
      referenceData,
      pricing,
      blotter,
      analytics,
      execution,
      instantReveal$: options.instantReveal$ ?? of(true),
    },
    executeTradeSpy,
  };
}

interface TurnRun {
  readonly events: JarvisEvent[];
  readonly done: Promise<void>;
}

/** Subscribes to ask(text) and resolves once the turn completes, collecting
 * every emitted event in order. */
function runTurn(adapter: ScriptedJarvisAdapter, text: string): TurnRun {
  const events: JarvisEvent[] = [];
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  adapter.ask(text).subscribe({
    next: (event: JarvisEvent) => {
      events.push(event);
    },
    complete: () => {
      resolveDone();
    },
  });
  return { events, done };
}

function fullText(events: readonly JarvisEvent[]): string {
  let text = "";

  for (const event of events) {
    if (event.type === "delta") {
      text += event.text;
    }
  }

  return text;
}
