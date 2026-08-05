import { NEVER, type Observable, of } from "rxjs";
import { delay } from "rxjs/operators";
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

import type { JarvisEvent } from "../jarvisEvent.js";
import { parsePanelSpec } from "../panelSpec.js";
import {
  type ScriptedJarvisDeps,
  ScriptedJarvisEngine,
} from "../ScriptedJarvisEngine.js";

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

describe("ScriptedJarvisEngine", () => {
  it("a quote turn emits toolEvent running -> chunked deltas reassembling the full reply -> done", async () => {
    const { deps } = buildDeps({ instantReveal$: of(false) });
    const adapter = new ScriptedJarvisEngine(deps);

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
    const adapter = new ScriptedJarvisEngine(deps);

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
    const adapter = new ScriptedJarvisEngine(deps);

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
      ratePrecision: 5,
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

  it("execution is not bound by the 2s read-snapshot timeout — a fill delayed past it (e.g. EURJPY's 4s simulator delay) is still reported, not the timeout copy", async () => {
    const trade: Trade = {
      tradeId: 2,
      tradeName: "t2",
      currencyPair: "EURUSD",
      notional: 1_000_000,
      dealtCurrency: "EUR",
      direction: Direction.Buy,
      spotRate: 1.0843,
      status: TradeStatus.Done,
      tradeDate: "2026-07-27",
      valueDate: "2026-07-29",
    };

    const { deps } = buildDeps({
      // Longer than SNAPSHOT_TIMEOUT_MS (2s) but well within an execution
      // budget — mirrors ExecutionSimulator's EURJPY-specific 4s delay.
      executeTrade: () => {
        return of(trade).pipe(delay(3_500));
      },
    });
    const adapter = new ScriptedJarvisEngine(deps);

    const { events, done } = runTurn(adapter, "buy 1M EURUSD");
    await Promise.resolve();
    await Promise.resolve();

    const confirmRequest = events.find((e) => {
      return e.type === "confirmRequest";
    });

    if (confirmRequest?.type !== "confirmRequest") {
      throw new Error("expected a confirmRequest event");
    }

    adapter.confirm(confirmRequest.confirmationId, true);
    await vi.advanceTimersByTimeAsync(3_500);
    await done;

    expect(
      events.some((e) => {
        return e.type === "error";
      }),
    ).toBe(false);
    expect(fullText(events)).toBe(
      "Very good, sir. Bought 1,000,000 EUR at 1.0843 — the trade is on your blotter.",
    );
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("declining a confirmation reports the decline and never calls ExecutionPort", async () => {
    const { deps, executeTradeSpy } = buildDeps();
    const adapter = new ScriptedJarvisEngine(deps);

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
    const adapter = new ScriptedJarvisEngine(deps);

    const { events, done } = runTurn(adapter, "hi");
    await vi.advanceTimersByTimeAsync(2_100);
    await done;

    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("error");
  });

  it("a pnl turn reads analytics + blotter behind a 'desk' toolEvent and formats the headline total", async () => {
    const { deps } = buildDeps({
      positions: {
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
      },
      trades: [makeTrade(1), makeTrade(2)],
    });
    const adapter = new ScriptedJarvisEngine(deps);

    const { events, done } = runTurn(adapter, "how am I doing?");
    await done;

    expect(events[0]).toEqual({
      type: "toolEvent",
      tool: "desk",
      status: "running",
    });
    expect(events[1]).toEqual({
      type: "toolEvent",
      tool: "desk",
      status: "done",
    });
    expect(fullText(events)).toBe(
      "Session P&L stands at +$125.0k, sir. 2 FX trades on the blotter.",
    );
  });

  it("a movers turn ranks by absolute pips delta, keeps the top 3, and signs losers with the typographic minus", async () => {
    const { deps } = buildDeps({
      pairs: [
        EURUSD,
        findPair("GBPUSD"),
        findPair("USDJPY"),
        findPair("AUDUSD"),
      ],
      history: {
        EURUSD: [makeTick("EURUSD", 1.083), makeTick("EURUSD", 1.0842)],
        GBPUSD: [makeTick("GBPUSD", 1.25), makeTick("GBPUSD", 1.247)],
        USDJPY: [makeTick("USDJPY", 154.5), makeTick("USDJPY", 154.55)],
        AUDUSD: [makeTick("AUDUSD", 0.66), makeTick("AUDUSD", 0.6602)],
      },
    });
    const adapter = new ScriptedJarvisEngine(deps);

    const { events, done } = runTurn(adapter, "what's moving?");
    await done;

    expect(events[0]).toEqual({
      type: "toolEvent",
      tool: "movers",
      status: "running",
    });
    // GBPUSD −30 outranks EURUSD +12 outranks USDJPY +5; AUDUSD +2 is cut by
    // the top-3 slice, and the loser is signed with U+2212, not a hyphen.
    expect(fullText(events)).toBe(
      "The board, sir: GBPUSD −30 pips · EURUSD +12 pips · USDJPY +5 pips.",
    );
  });

  it("a spread turn surfaces the same 'quote' toolEvent as a quote turn around its pricing read", async () => {
    const { deps } = buildDeps({});
    const adapter = new ScriptedJarvisEngine(deps);

    const { events, done } = runTurn(adapter, "what's the spread on EURUSD?");
    await done;

    expect(events[0]).toEqual({
      type: "toolEvent",
      tool: "quote",
      status: "running",
    });
    expect(events[1]).toEqual({
      type: "toolEvent",
      tool: "quote",
      status: "done",
    });
    expect(fullText(events)).toBe("EURUSD spread is currently 2 pips, sir.");
  });

  it("a showPanel turn emits the canned GBP-volatility panel (round-tripping parsePanelSpec against the engine's own roster) followed by speech + done", async () => {
    const { deps } = buildDeps({
      pairs: KNOWN_CURRENCY_PAIRS,
      instantReveal$: of(true),
    });

    const knownSymbols = KNOWN_CURRENCY_PAIRS.map((p) => {
      return p.symbol;
    });
    const adapter = new ScriptedJarvisEngine(deps);

    const { events, done } = runTurn(adapter, "show me gbp volatility");
    await done;

    const panelEvents = events.filter((e) => {
      return e.type === "panel";
    });
    expect(panelEvents).toHaveLength(1);

    const panelEvent = panelEvents[0];

    if (panelEvent?.type !== "panel") {
      throw new Error("expected a panel event");
    }

    expect(panelEvent.panelId).toBe("panel-scripted-1");
    expect(parsePanelSpec(panelEvent.spec, knownSymbols)).toEqual({
      ok: true,
      spec: panelEvent.spec,
    });
    expect(panelEvent.spec.source).toEqual({
      kind: "priceHistory",
      symbols: ["GBPUSD", "GBPJPY"],
    });
    expect(
      panelEvent.spec.transforms.some((t) => {
        return t.kind === "rollingVol";
      }),
    ).toBe(true);
    expect(panelEvent.spec.viz).toEqual({ kind: "line" });
    expect(
      events.some((e) => {
        return e.type === "delta";
      }),
    ).toBe(true);
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("a restylePanel turn re-emits the same panelId with the new viz", async () => {
    const { deps } = buildDeps({
      pairs: KNOWN_CURRENCY_PAIRS,
      instantReveal$: of(true),
    });
    const adapter = new ScriptedJarvisEngine(deps);

    const shown = runTurn(adapter, "show me gbp volatility");
    await shown.done;

    const restyled = runTurn(adapter, "make it a heatmap");
    await restyled.done;

    const panelEvents = restyled.events.filter((e) => {
      return e.type === "panel";
    });
    expect(panelEvents).toHaveLength(1);

    const panelEvent = panelEvents[0];

    if (panelEvent?.type !== "panel") {
      throw new Error("expected a panel event");
    }

    expect(panelEvent.panelId).toBe("panel-scripted-1");
    expect(panelEvent.spec.viz).toEqual({ kind: "heatmap" });
    expect(panelEvent.spec.source).toEqual({
      kind: "priceHistory",
      symbols: ["GBPUSD", "GBPJPY"],
    });
  });

  it("a restylePanel turn with no prior panel this session gets a fallback-style reply and emits no panel event", async () => {
    const { deps } = buildDeps({ instantReveal$: of(true) });
    const adapter = new ScriptedJarvisEngine(deps);

    const { events, done } = runTurn(adapter, "make it a heatmap");
    await done;

    expect(
      events.some((e) => {
        return e.type === "panel";
      }),
    ).toBe(false);
    expect(fullText(events)).toBe("There's no panel open to restyle yet, sir.");
    expect(events.at(-1)).toEqual({ type: "done" });
  });

  it("a help turn replies with the capability roster verbatim", async () => {
    const { deps } = buildDeps({});
    const adapter = new ScriptedJarvisEngine(deps);

    const { events, done } = runTurn(adapter, "what can you do?");
    await done;

    expect(fullText(events)).toBe(
      "At your service, sir. I can quote the majors, report the movers, " +
        "brief you on the desk, or execute FX orders. Sentinels, widgets and " +
        "drills arrive in a later build, sir.",
    );
  });

  it("an unmatched turn replies with the fallback mandate verbatim", async () => {
    const { deps } = buildDeps({});
    const adapter = new ScriptedJarvisEngine(deps);

    const { events, done } = runTurn(adapter, "make me a sandwich");
    await done;

    expect(fullText(events)).toBe(
      "I'm afraid that request is outside my current mandate, sir. I can " +
        "quote the majors, report the movers, brief you on the desk, or " +
        "execute FX orders.",
    );
  });

  it("tearing a turn down mid-confirmation cancels the pending Subject: a late confirm() is a no-op and never executes", async () => {
    const { deps, executeTradeSpy } = buildDeps({});
    const adapter = new ScriptedJarvisEngine(deps);

    const events: JarvisEvent[] = [];
    const subscription = adapter.ask("buy 5M EURUSD").subscribe((event) => {
      events.push(event);
    });
    await Promise.resolve();
    await Promise.resolve();

    const confirmRequest = events.find((e) => {
      return e.type === "confirmRequest";
    });

    if (confirmRequest?.type !== "confirmRequest") {
      throw new Error("expected a confirmRequest event");
    }

    subscription.unsubscribe();

    adapter.confirm(confirmRequest.confirmationId, true);
    await vi.advanceTimersByTimeAsync(5_000);

    expect(executeTradeSpy).not.toHaveBeenCalled();
    expect(events.at(-1)?.type).toBe("confirmRequest");
  });

  it("two trade turns produce distinct, non-sequential confirmationIds — not a guessable 'confirm-1'/'confirm-2' counter", async () => {
    const { deps } = buildDeps({
      executeTrade: () => {
        return of(makeTrade(1));
      },
    });
    const adapter = new ScriptedJarvisEngine(deps);

    const first = runTurn(adapter, "buy 5M EURUSD");
    await Promise.resolve();
    await Promise.resolve();
    const firstConfirm = first.events.find((e) => {
      return e.type === "confirmRequest";
    });

    if (firstConfirm?.type !== "confirmRequest") {
      throw new Error("expected a confirmRequest event");
    }

    adapter.confirm(firstConfirm.confirmationId, true);
    await first.done;

    const second = runTurn(adapter, "buy 5M EURUSD");
    await Promise.resolve();
    await Promise.resolve();
    const secondConfirm = second.events.find((e) => {
      return e.type === "confirmRequest";
    });

    if (secondConfirm?.type !== "confirmRequest") {
      throw new Error("expected a confirmRequest event");
    }

    adapter.confirm(secondConfirm.confirmationId, true);
    await second.done;

    expect(firstConfirm.confirmationId).toMatch(/^confirm-[0-9a-f-]{36}$/);
    expect(secondConfirm.confirmationId).toMatch(/^confirm-[0-9a-f-]{36}$/);
    expect(firstConfirm.confirmationId).not.toBe(secondConfirm.confirmationId);
  });
});

function makeTrade(tradeId: number): Trade {
  return {
    tradeId,
    tradeName: `t${tradeId}`,
    currencyPair: "EURUSD",
    notional: 5_000_000,
    dealtCurrency: "EUR",
    direction: Direction.Buy,
    spotRate: 1.0843,
    status: TradeStatus.Done,
    tradeDate: "2026-07-27",
    valueDate: "2026-07-29",
  };
}

function makeTick(symbol: string, mid: number): PriceTick {
  return {
    symbol,
    bid: mid - 0.0001,
    ask: mid + 0.0001,
    mid,
    valueDate: "2026-07-27",
    creationTimestamp: 1,
  };
}

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
function runTurn(adapter: ScriptedJarvisEngine, text: string): TurnRun {
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
