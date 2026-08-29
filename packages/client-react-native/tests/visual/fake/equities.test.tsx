import { expect, test } from "@jest/globals";
import { renderHook } from "@testing-library/react-native";

import type { DepthLevel } from "@rtc/domain";

import { equitiesSlice } from "./equities";

test("useCandles returns the identical array reference across calls, per symbol", async () => {
  const first = await readCandles("AAPL");
  const second = await readCandles("AAPL");
  expect(first).toBe(second);
});

test("every candle for every watchlist symbol carries a volume and a valid OHLC range", async () => {
  const symbols = await readWatchlistSymbols();
  expect(symbols.length).toBeGreaterThan(0);

  for (const symbol of symbols) {
    const candles = await readCandles(symbol);
    expect(candles.length).toBeGreaterThan(0);

    for (const candle of candles) {
      expect(typeof candle.volume).toBe("number");
      expect(Number.isFinite(candle.volume)).toBe(true);
      expect(candle.volume).toBeGreaterThan(0);
      expect(candle.low).toBeLessThanOrEqual(
        Math.min(candle.open, candle.close),
      );
      expect(Math.max(candle.open, candle.close)).toBeLessThanOrEqual(
        candle.high,
      );
    }
  }
});

test("useEquityQuote is reference-stable per symbol", async () => {
  const first = await readQuote("AAPL");
  const second = await readQuote("AAPL");
  expect(first).toBe(second);
  expect(first).not.toBeNull();
});

test("the quote roster spans both signs of changePct", async () => {
  const symbols = await readWatchlistSymbols();
  const changePcts: number[] = [];

  for (const symbol of symbols) {
    const quote = await readQuote(symbol);
    changePcts.push(quote?.changePct ?? 0);
  }

  expect(
    changePcts.some((pct) => {
      return pct > 0;
    }),
  ).toBe(true);
  expect(
    changePcts.some((pct) => {
      return pct < 0;
    }),
  ).toBe(true);
});

test("the depth book's bids descend, asks ascend, and the two sides never cross", async () => {
  const { result } = await renderHook(() => {
    return equitiesSlice.useDepth("AAPL");
  });
  const book = result.current;
  expect(book).not.toBeNull();

  const bids = book?.bids ?? [];
  const asks = book?.asks ?? [];
  expect(bids.length).toBeGreaterThanOrEqual(8);
  expect(asks.length).toBeGreaterThanOrEqual(8);

  for (let i = 1; i < bids.length; i++) {
    expect((bids[i] as DepthLevel).price).toBeLessThan(
      (bids[i - 1] as DepthLevel).price,
    );
  }

  for (let i = 1; i < asks.length; i++) {
    expect((asks[i] as DepthLevel).price).toBeGreaterThan(
      (asks[i - 1] as DepthLevel).price,
    );
  }

  expect((bids[0] as DepthLevel).price).toBeLessThan(
    (asks[0] as DepthLevel).price,
  );
});

test("useOrderTicket seeds the editing form's symbol from the given defaultSymbol", async () => {
  const { result } = await renderHook(() => {
    return equitiesSlice.useOrderTicket("AAPL");
  });
  const ticket = result.current;
  expect(ticket.state.phase).toBe("editing");

  if (ticket.state.phase !== "editing") {
    throw new Error("expected the editing arm");
  }

  expect(ticket.state.form.symbol).toBe("AAPL");
  expect(ticket.state.form.side).toBe("buy");
  // LMT with the 500 chip lit: the state the design's TRADE panel shows, so
  // the `equities/trade` golden holds every ticket row (see the fixture).
  expect(ticket.state.form.type).toBe("limit");
  expect(ticket.state.form.qty).toBe(500);
  expect(ticket.state.error).toBeNull();
});

test("the orders fixture covers more than one OrderStatus and both OrderSide values", async () => {
  const { result } = await renderHook(() => {
    return equitiesSlice.useEquityOrders();
  });
  const orders = result.current;
  const statuses = new Set(
    orders.map((order) => {
      return order.status;
    }),
  );

  const sides = new Set(
    orders.map((order) => {
      return order.side;
    }),
  );

  expect(statuses.size).toBeGreaterThan(1);
  expect(sides.size).toBe(2);
});

test("the positions fixture is non-empty", async () => {
  const { result } = await renderHook(() => {
    return equitiesSlice.useEquityPositions();
  });
  expect(result.current.length).toBeGreaterThan(0);
});

test("loadOlderCandles does not throw and leaves useCandles' return untouched", async () => {
  const before = await readCandles("AAPL");

  expect(() => {
    equitiesSlice.loadOlderCandles("AAPL");
    equitiesSlice.loadOlderCandles("AAPL", "1W");
  }).not.toThrow();

  const after = await readCandles("AAPL");
  expect(after).toBe(before);
});

// Every fixture above is a plain deterministic function, not a real React
// hook (no useState/useEffect/context) — but it's still named `useX` to
// satisfy the `EquitiesSlice` contract, so a direct call trips Biome's
// `useHookAtTopLevel` heuristic wherever the call sits inside a loop.
// Routing every call through `renderHook` (the same wrapper
// `createViewModel.equities.test.ts` uses for the REAL hooks) sidesteps
// that: each call becomes its own single-hook render, unconditional within
// its own render function, with the surrounding `for`/`.map` only choosing
// which symbol to render for — never wrapping the hook call itself.
async function readWatchlistSymbols(): Promise<readonly string[]> {
  const { result } = await renderHook(() => {
    return equitiesSlice.useWatchlist();
  });
  return result.current.map((inst) => {
    return inst.symbol;
  });
}

async function readCandles(
  symbol: string,
): Promise<ReturnType<typeof equitiesSlice.useCandles>> {
  const { result } = await renderHook(() => {
    return equitiesSlice.useCandles(symbol);
  });
  return result.current;
}

async function readQuote(
  symbol: string,
): Promise<ReturnType<typeof equitiesSlice.useEquityQuote>> {
  const { result } = await renderHook(() => {
    return equitiesSlice.useEquityQuote(symbol);
  });
  return result.current;
}
