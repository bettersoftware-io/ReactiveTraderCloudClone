import { defer, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RfqState, Stream } from "@rtc/core-api";
import {
  type CurrencyPair,
  KNOWN_CURRENCY_PAIRS,
  RFQ_COUNTDOWN_INTERVAL_MS,
  RFQ_TIMEOUT_MS,
  type RfqQuoteResult,
} from "@rtc/domain";

import { createRfqTileMachine } from "#/machines/rfqTile";

describe("createRfqTileMachine (async)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requestQuote() asks the injected command for this pair's quote, once", async () => {
    const { deps, calls } = createDeps();
    const m = createRfqTileMachine(EURUSD, deps);
    const seen: RfqState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    m.intents.requestQuote();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.requests).toEqual([
      { symbol: EURUSD.symbol, pipsPosition: EURUSD.pipsPosition },
    ]);
    expect(seen.at(-1)?.status).toBe("requested");
    sub.unsubscribe();
    m.dispose();
  });

  it("a resolved quote lands received at RFQ_TIMEOUT_MS and ticks one interval down", async () => {
    const { deps, calls } = createDeps();
    const m = createRfqTileMachine(EURUSD, deps);
    const seen: RfqState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    m.intents.requestQuote();
    await vi.advanceTimersByTimeAsync(0);
    calls.results[0]?.next(createQuoteResult());
    await vi.advanceTimersByTimeAsync(0);
    expect(seen.at(-1)).toEqual({
      status: "received",
      quote: { bid: 1.1, ask: 1.2, timeoutMs: RFQ_TIMEOUT_MS },
      remainingMs: RFQ_TIMEOUT_MS,
    });
    await vi.advanceTimersByTimeAsync(RFQ_COUNTDOWN_INTERVAL_MS);
    expect(seen.at(-1)?.remainingMs).toBe(
      RFQ_TIMEOUT_MS - RFQ_COUNTDOWN_INTERVAL_MS,
    );
    sub.unsubscribe();
    m.dispose();
  });

  it("cancel() from requested withdraws the in-flight command and lands init", async () => {
    const { deps, calls } = createDeps();
    const m = createRfqTileMachine(EURUSD, deps);
    const seen: RfqState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    m.intents.requestQuote();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls.results[0]?.observed).toBe(true);
    m.intents.cancel();
    expect(calls.results[0]?.observed).toBe(false);
    expect(seen.at(-1)).toEqual(INIT);
    sub.unsubscribe();
    m.dispose();
  });

  it("dispose() mid-countdown stops the ticks", async () => {
    const { deps, calls } = createDeps();
    const m = createRfqTileMachine(EURUSD, deps);
    const seen: RfqState[] = [];
    const sub = m.state$.subscribe((state) => {
      seen.push(state);
    });
    m.intents.requestQuote();
    await vi.advanceTimersByTimeAsync(0);
    calls.results[0]?.next(createQuoteResult());
    await vi.advanceTimersByTimeAsync(2 * RFQ_COUNTDOWN_INTERVAL_MS);
    const frozen = seen.length;
    m.dispose();
    await vi.advanceTimersByTimeAsync(RFQ_TIMEOUT_MS);
    expect(seen).toHaveLength(frozen);
    sub.unsubscribe();
  });

  interface QuoteCall {
    symbol: string;
    pipsPosition: number;
  }

  interface QuoteCalls {
    requests: QuoteCall[];
    results: Subject<RfqQuoteResult>[];
  }

  interface QuoteDeps {
    requestQuote: (
      symbol: string,
      pipsPosition: number,
    ) => Stream<RfqQuoteResult>;
  }

  interface DepsFixture {
    deps: QuoteDeps;
    calls: QuoteCalls;
  }

  function createQuoteResult(): RfqQuoteResult {
    return { bid: 1.1, ask: 1.2, mid: 1.15 };
  }

  function createDeps(): DepsFixture {
    const calls: QuoteCalls = { requests: [], results: [] };
    return {
      calls,
      deps: {
        requestQuote: (symbol: string, pipsPosition: number) => {
          return defer(() => {
            calls.requests.push({ symbol, pipsPosition });
            const results = new Subject<RfqQuoteResult>();
            calls.results.push(results);
            return results;
          });
        },
      },
    };
  }
});

const EURUSD: CurrencyPair = KNOWN_CURRENCY_PAIRS[0];

const INIT: RfqState = { status: "init", quote: null, remainingMs: 0 };
