import { defer, type Observable, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RfqState, Stream } from "@rtc/core-api";
import {
  type CurrencyPair,
  KNOWN_CURRENCY_PAIRS,
  REJECTED_DISPLAY_MS,
  RFQ_COUNTDOWN_INTERVAL_MS,
  RFQ_TIMEOUT_MS,
  type RfqQuoteResult,
} from "@rtc/domain";

import { createRfqTileMachine } from "#/machines/rfqTile";

describe("createRfqTileMachine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requestQuote() asks the dep for THIS pair's symbol and pips, once, and lands requested", async () => {
    const quotes = createQuoteRequests();
    const m = createRfqTileMachine(EURUSD, quotes.deps);
    const seen = collect(m.state$);
    expect(seen).toEqual([INIT]);
    m.intents.requestQuote();
    await settle();
    expect(quotes.requests()).toEqual([{ symbol: "EURUSD", pipsPosition: 4 }]);
    expect(seen.at(-1)?.status).toBe("requested");
    m.dispose();
  });

  it("a result lands received at RFQ_TIMEOUT_MS and the next tick is one interval lower", async () => {
    const quotes = createQuoteRequests();
    const m = createRfqTileMachine(EURUSD, quotes.deps);
    const seen = collect(m.state$);
    m.intents.requestQuote();
    await settle();
    quotes.resolve({ bid: 1.0999, ask: 1.1001, mid: 1.1 });
    await settle();
    expect(seen.at(-1)).toEqual({
      status: "received",
      quote: { bid: 1.0999, ask: 1.1001, timeoutMs: RFQ_TIMEOUT_MS },
      remainingMs: RFQ_TIMEOUT_MS,
    });
    await vi.advanceTimersByTimeAsync(RFQ_COUNTDOWN_INTERVAL_MS);
    await settle();
    expect(seen.at(-1)?.remainingMs).toBe(
      RFQ_TIMEOUT_MS - RFQ_COUNTDOWN_INTERVAL_MS,
    );
    m.dispose();
  });

  it("cancel() from requested releases the dep's subscription and lands init", async () => {
    const quotes = createQuoteRequests();
    const m = createRfqTileMachine(EURUSD, quotes.deps);
    const seen = collect(m.state$);
    m.intents.requestQuote();
    await settle();
    expect(quotes.observed()).toBe(true);
    m.intents.cancel();
    await settle();
    expect(quotes.observed()).toBe(false);
    expect(seen.at(-1)).toEqual(INIT);
    m.dispose();
  });

  it("a failing request holds rejected for REJECTED_DISPLAY_MS and then returns to init", async () => {
    const quotes = createQuoteRequests();
    const m = createRfqTileMachine(EURUSD, quotes.deps);
    const seen = collect(m.state$);
    m.intents.requestQuote();
    await settle();
    quotes.fail(new Error("bust"));
    await settle();
    expect(seen.at(-1)?.status).toBe("rejected");
    await vi.advanceTimersByTimeAsync(REJECTED_DISPLAY_MS - 1);
    await settle();
    expect(seen.at(-1)?.status).toBe("rejected");
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(seen.at(-1)).toEqual(INIT);
    m.dispose();
  });

  it("dispose() mid-countdown stops the ticks and makes the intents inert", async () => {
    const quotes = createQuoteRequests();
    const m = createRfqTileMachine(EURUSD, quotes.deps);
    const seen = collect(m.state$);
    m.intents.requestQuote();
    await settle();
    quotes.resolve({ bid: 1.0999, ask: 1.1001, mid: 1.1 });
    await settle();
    m.dispose();
    const frozen = seen.length;
    await vi.advanceTimersByTimeAsync(5 * RFQ_COUNTDOWN_INTERVAL_MS);
    await settle();
    expect(seen).toHaveLength(frozen);
    m.intents.requestQuote();
    await settle();
    expect(quotes.requests()).toHaveLength(1);
  });
});

interface RecordedRequest {
  symbol: string;
  pipsPosition: number;
}

interface TestQuoteRequests {
  deps: {
    requestQuote: (
      symbol: string,
      pipsPosition: number,
    ) => Observable<RfqQuoteResult>;
  };
  requests: () => readonly RecordedRequest[];
  observed: () => boolean;
  resolve: (result: RfqQuoteResult) => void;
  fail: (error: unknown) => void;
}

/** The injected `requestQuote` command as a `defer`-wrapped Subject: the
 * request is recorded on SUBSCRIBE, and `observed` is the witness that an
 * interrupted run released the port. */
function createQuoteRequests(): TestQuoteRequests {
  const requests: RecordedRequest[] = [];
  let live = new Subject<RfqQuoteResult>();

  return {
    deps: {
      requestQuote: (symbol: string, pipsPosition: number) => {
        return defer(() => {
          requests.push({ symbol, pipsPosition });
          return live;
        });
      },
    },
    requests: () => {
      return requests;
    },
    observed: () => {
      return live.observed;
    },
    resolve: (result: RfqQuoteResult) => {
      live.next(result);
      live.complete();
    },
    fail: (error: unknown) => {
      live.error(error);
      live = new Subject<RfqQuoteResult>();
    },
  };
}

function collect(stream: Stream<RfqState>): RfqState[] {
  const values: RfqState[] = [];
  stream.subscribe((value: RfqState) => {
    values.push(value);
  });
  return values;
}

function findPair(symbol: string): CurrencyPair {
  const pair = KNOWN_CURRENCY_PAIRS.find((candidate) => {
    return candidate.symbol === symbol;
  });

  if (pair === undefined) {
    throw new Error(`${symbol} is not a known currency pair`);
  }

  return pair;
}

/** Two zero-length advances: no time moves, the microtask continuations an
 * Effect fiber resumes on do. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

const INIT: RfqState = { status: "init", quote: null, remainingMs: 0 };

const EURUSD = findPair("EURUSD");
