import { firstValueFrom, Subject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { EquityInstrument, MarketDataPort } from "@rtc/domain";

import { firstWatchlistSymbol$ } from "#/composition";
import {
  createEqWorkspaceMachine,
  WatchlistPresenter,
} from "#/presenters/index";

const AAPL: EquityInstrument = {
  symbol: "AAPL",
  name: "Apple Inc",
  exchange: "NASDAQ",
};

describe("composition — firstWatchlistSymbol$ (C2 async watchlist recovery)", () => {
  it("resolves the first symbol once the watchlist arrives, and never before", async () => {
    const source$ = new Subject<readonly EquityInstrument[]>();
    const watchlist = new WatchlistPresenter(makeAsyncMarketDataPort(source$));

    const resolved = firstValueFrom(
      firstWatchlistSymbol$(watchlist.watchlist$),
    );

    // Give the microtask queue a tick — resolved must NOT settle yet.
    let settled = false;
    void resolved.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    source$.next([AAPL]);
    expect(await resolved).toBe("AAPL");
  });

  it("ignores an empty list and only resolves once a non-empty one arrives", async () => {
    const source$ = new Subject<readonly EquityInstrument[]>();
    const watchlist = new WatchlistPresenter(makeAsyncMarketDataPort(source$));

    const resolved = firstValueFrom(
      firstWatchlistSymbol$(watchlist.watchlist$),
    );
    source$.next([]);
    source$.next([AAPL]);

    expect(await resolved).toBe("AAPL");
  });
});

describe("composition — EqWorkspaceMachine wired to an async watchlist port (C2 end-to-end)", () => {
  it("the eq-workspace starts empty (no phantom tab) then self-seeds once the watchlist lands", async () => {
    const source$ = new Subject<readonly EquityInstrument[]>();
    const watchlist = new WatchlistPresenter(makeAsyncMarketDataPort(source$));

    // Mirrors composition.ts's createApp wiring exactly: initialSymbol from the
    // synchronous peek (finds nothing — the port is async) + seed$ from
    // firstWatchlistSymbol$ for recovery.
    const eqWorkspace = createEqWorkspaceMachine({
      initialSymbol: "",
      seed$: firstWatchlistSymbol$(watchlist.watchlist$),
    });

    let state = await firstValueFrom(eqWorkspace.state$);
    expect(state).toEqual({ sel: "", openTabs: [], timeframe: "1D" });

    source$.next([AAPL]);

    state = await firstValueFrom(eqWorkspace.state$);
    expect(state).toEqual({ sel: "AAPL", openTabs: ["AAPL"], timeframe: "1D" });

    eqWorkspace.dispose();
  });
});

/** A MarketDataPort fake whose watchlist() is driven by a plain Subject — an
 * async watchlist port, standing in for the real WS-real backend where the
 * catalogue arrives over the wire (not synchronously like the simulator's
 * `of(WATCHLIST)`). Only watchlist() is exercised by these tests. */
function makeAsyncMarketDataPort(
  watchlist$: Subject<readonly EquityInstrument[]>,
): MarketDataPort {
  return {
    watchlist: () => {
      return watchlist$.asObservable();
    },
    quotes: (): never => {
      throw new Error("not used by this test");
    },
    candles: (): never => {
      throw new Error("not used by this test");
    },
    depth: (): never => {
      throw new Error("not used by this test");
    },
  } as unknown as MarketDataPort;
}
