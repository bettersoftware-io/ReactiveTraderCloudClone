import { EqWatchlistHead, WatchlistPanel } from "@ui-contract/components";
import {
  cleanupMounted,
  createWorld,
  mount,
  mountWith,
} from "@ui-contract/mount";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { EquityInstrument, EquityQuote } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

const INSTRUMENTS: readonly EquityInstrument[] = [
  { symbol: "AAPL", name: "Apple Inc", exchange: "NASDAQ" },
  { symbol: "MSFT", name: "Microsoft Corp", exchange: "NASDAQ" },
  { symbol: "TSLA", name: "Tesla Inc", exchange: "NASDAQ" },
];

const QUOTES = {
  AAPL: quote("AAPL", 229.35, 0.5),
  MSFT: quote("MSFT", 467.12, 2.1),
  TSLA: quote("TSLA", 251.44, -1.2),
};

describe("WatchlistPanel — rows", () => {
  it("renders a row per watchlist instrument, sorted by the default (chg) preference", () => {
    const panel = mount(WatchlistPanel, {
      equities: { watchlist: INSTRUMENTS, quotes: QUOTES },
    });

    expect(panel.rows()).toEqual(["MSFT", "AAPL", "TSLA"]);
  });

  it("shows an empty-state placeholder when there are no instruments", () => {
    const panel = mount(WatchlistPanel, {});

    expect(panel.isEmpty()).toBe(true);
    expect(panel.rows()).toEqual([]);
  });

  it("reflects the shared eqWorkspace selection as the active row", () => {
    const panel = mount(WatchlistPanel, {
      equities: {
        watchlist: INSTRUMENTS,
        quotes: QUOTES,
        initialSymbol: "MSFT",
      },
    });

    expect(panel.selectedSymbol()).toBe("MSFT");
  });

  it("renders a row with no quote yet without crashing, sorted to the end", () => {
    // AMZN has no seeded quote — the row's useEquityQuote(symbol) hasn't
    // ticked yet, exercising the null-quote guard in both WatchlistRow and
    // the sort's null-handling in watchlistVm.
    const withUnquoted = [
      ...INSTRUMENTS,
      { symbol: "AMZN", name: "Amazon.com", exchange: "NASDAQ" },
    ];

    const panel = mount(WatchlistPanel, {
      equities: { watchlist: withUnquoted, quotes: QUOTES },
    });

    expect(panel.rows()).toEqual(["MSFT", "AAPL", "TSLA", "AMZN"]);
  });

  it("re-runs the rank-glide layout pass for a single-row watchlist without crashing", () => {
    // With exactly one row, the glide's row-height measurement takes its
    // fallback (fewer than two nodes to measure a gap between).
    const world = createWorld(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { watchlist: [INSTRUMENTS[0] as EquityInstrument], quotes: QUOTES },
    );
    const panel = mountWith(world, WatchlistPanel, {});

    expect(panel.rows()).toEqual(["AAPL"]);

    panel.setEquityQuote("AAPL", quote("AAPL", 240, 4.6));

    expect(panel.rows()).toEqual(["AAPL"]);
  });
});

describe("WatchlistPanel — tick pulse", () => {
  it("renders no pulse before the first tick, then one on the next quote change", () => {
    const world = createWorld(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { watchlist: INSTRUMENTS, quotes: QUOTES },
    );
    const panel = mountWith(world, WatchlistPanel, {});

    // The seeded quote is the FIRST tick this row observes — no prior value
    // to diff against, so no pulse yet.
    expect(panel.flashDirection("AAPL")).toBeNull();

    panel.setEquityQuote("AAPL", quote("AAPL", 235, 3.2));
    expect(panel.flashDirection("AAPL")).toBe("up");

    panel.setEquityQuote("AAPL", quote("AAPL", 220, -3.6));
    expect(panel.flashDirection("AAPL")).toBe("down");
  });

  it("re-reporting the same last/changePct is a no-op for the panel's sort inputs", () => {
    const world = createWorld(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { watchlist: INSTRUMENTS, quotes: QUOTES },
    );
    const panel = mountWith(world, WatchlistPanel, {});

    panel.setEquityQuote("AAPL", quote("AAPL", 235, 3.2));
    expect(panel.rows()).toEqual(["AAPL", "MSFT", "TSLA"]);

    // Same last/changePct values (a fresh object, but the panel dedupes on
    // value equality) — the sort order is unaffected.
    panel.setEquityQuote("AAPL", quote("AAPL", 235, 3.2));
    expect(panel.rows()).toEqual(["AAPL", "MSFT", "TSLA"]);
  });
});

describe("WatchlistPanel — row select hits the shared eqWorkspace machine", () => {
  it("clicking a row selects it in the REAL eqWorkspace machine, observed by a second independent mount", async () => {
    const world = createWorld(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { watchlist: INSTRUMENTS, quotes: QUOTES, initialSymbol: "AAPL" },
    );
    // Two independent mounts sharing one World's REAL eqWorkspace machine —
    // proves the click drives the shared singleton, not local component state
    // (mirrors the EqWorkspaceMachine cross-component-sharing proof).
    const panel = mountWith(world, WatchlistPanel, {});
    const otherPanel = mountWith(world, WatchlistPanel, {});

    expect(panel.selectedSymbol()).toBe("AAPL");
    expect(otherPanel.selectedSymbol()).toBe("AAPL");

    await panel.select("TSLA");

    expect(panel.selectedSymbol()).toBe("TSLA");
    expect(otherPanel.selectedSymbol()).toBe("TSLA");
  });
});

describe("WatchlistPanel — I4 coalesced reorders (fake WAAPI)", () => {
  // jsdom has no Element.animate, so useRankGlide's gliding-gate never
  // engages there (the real bug/fix only bites in a real browser). This
  // stubs a controllable fake Animation — a resolvable `.finished` promise —
  // so the coalescing gate DOES engage, proving end-to-end (through the real
  // WatchlistPanel + useRankGlide, not just the pure coalesceOrder function)
  // that a second rapid reorder while the first is still "gliding" is
  // buffered instead of committed, and applied only once the glide settles.
  let resolveFns: Array<() => void> = [];
  let originalAnimate: typeof Element.prototype.animate | undefined;

  function fakeAnimate(): Animation {
    let resolveFinished: (() => void) | undefined;
    const finished = new Promise<Animation>((resolve) => {
      resolveFinished = (): void => {
        resolve(fake);
      };
    });
    // The Promise executor above runs synchronously, so resolveFinished is
    // already assigned by the time we get here.
    resolveFns.push(resolveFinished as () => void);
    const fake = { finished } as unknown as Animation;
    return fake;
  }

  beforeEach(() => {
    resolveFns = [];
    originalAnimate = Element.prototype.animate;
    Element.prototype.animate = fakeAnimate;
  });

  afterEach(() => {
    // jsdom has no Element.animate at all — restore that exact absence,
    // rather than leaving the fake in place when `originalAnimate` is
    // undefined (a falsy `if` would silently skip restoring it, leaking the
    // stub into every later test in the file).
    if (originalAnimate) {
      Element.prototype.animate = originalAnimate;
    } else {
      delete (Element.prototype as MaybeAnimateProp).animate;
    }
  });

  async function settleGlide(panel: GlideFlusher): Promise<void> {
    const toResolve = resolveFns;
    resolveFns = [];
    await panel.flushAsync(async () => {
      toResolve.forEach((resolve) => {
        resolve();
      });
      // Flush the .then() microtask chain that applies the buffered order.
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("a second rapid reorder while the first is still gliding is buffered, then applied once settled", async () => {
    const world = createWorld(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { watchlist: INSTRUMENTS, quotes: QUOTES },
    );
    const panel = mountWith(world, WatchlistPanel, {});

    // Mount itself settles a "reorder": rows start in raw watchlist order
    // (no quotes reported yet on the very first render) and re-sort once
    // each row's own useEquityQuote effect reports its seeded quote — that
    // settling already kicks off a (fake) glide. Drain it so the test
    // exercises a clean idle→gliding→buffered→settled cycle from here.
    await settleGlide(panel);
    expect(panel.rows()).toEqual(["MSFT", "AAPL", "TSLA"]);

    // First reorder: TSLA's chg jumps to the top. Idle → commits immediately
    // and kicks off the (fake) glide.
    panel.setEquityQuote("TSLA", quote("TSLA", 260, 5.0));
    expect(panel.rows()).toEqual(["TSLA", "MSFT", "AAPL"]);
    expect(resolveFns.length).toBeGreaterThan(0);

    // Second reorder arrives WHILE the first glide is still in flight: AAPL's
    // chg jumps above everything. Must be BUFFERED — rows stay exactly as
    // the first commit left them; the intermediate churn never renders.
    panel.setEquityQuote("AAPL", quote("AAPL", 300, 10.0));
    expect(panel.rows()).toEqual(["TSLA", "MSFT", "AAPL"]);

    // Settle the first glide — the buffered (second) order applies now, in
    // one step, directly to the final coalesced order.
    await settleGlide(panel);
    expect(panel.rows()).toEqual(["AAPL", "TSLA", "MSFT"]);
  });

  it("skips a committed symbol that's been removed from the watchlist while its glide was still in flight", async () => {
    const world = createWorld(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { watchlist: INSTRUMENTS, quotes: QUOTES },
    );
    const panel = mountWith(world, WatchlistPanel, {});
    await settleGlide(panel);
    expect(panel.rows()).toEqual(["MSFT", "AAPL", "TSLA"]);

    // Kick off a glide (idle → commits immediately).
    panel.setEquityQuote("TSLA", quote("TSLA", 260, 5.0));
    expect(panel.rows()).toEqual(["TSLA", "MSFT", "AAPL"]);
    expect(resolveFns.length).toBeGreaterThan(0);

    // AAPL is removed from the watchlist entirely WHILE that glide is still
    // in flight — the committed order still lists it (buffered, not yet
    // re-evaluated), but its instrument is gone, so the row must be skipped
    // rather than rendered with no name.
    panel.setWatchlist(
      INSTRUMENTS.filter((inst) => {
        return inst.symbol !== "AAPL";
      }),
    );
    expect(panel.rows()).toEqual(["TSLA", "MSFT"]);

    // Once the glide settles, the next commit reflects AAPL's removal for good.
    await settleGlide(panel);
    expect(panel.rows()).toEqual(["TSLA", "MSFT"]);
  });
});

describe("WatchlistPanel + EqWatchlistHead — sort cycle order + persistence", () => {
  it("cycling the head's ⇅ chip re-sorts the SAME shared watchlist rows", async () => {
    const world = createWorld(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { watchlist: INSTRUMENTS, quotes: QUOTES },
    );
    const panel = mountWith(world, WatchlistPanel, {});
    const head = mountWith(world, EqWatchlistHead, {});

    // Default seam value is "chg" (DEFAULT_EQ_WATCHLIST_SORT).
    expect(head.label()).toBe("⇅ % CHG");
    expect(panel.rows()).toEqual(["MSFT", "AAPL", "TSLA"]);

    await head.cycle();
    expect(head.label()).toBe("⇅ PRICE");
    expect(panel.rows()).toEqual(["MSFT", "TSLA", "AAPL"]);

    await head.cycle();
    expect(head.label()).toBe("⇅ A–Z");
    expect(panel.rows()).toEqual(["AAPL", "MSFT", "TSLA"]);

    await head.cycle();
    expect(head.label()).toBe("⇅ % CHG");
    expect(panel.rows()).toEqual(["MSFT", "AAPL", "TSLA"]);
  });
});

function quote(symbol: string, last: number, changePct: number): EquityQuote {
  return {
    symbol,
    bid: last - 0.05,
    ask: last + 0.05,
    last,
    changePct,
    timestamp: 0,
  };
}

/** Minimal shape for deleting a possibly-absent `animate` from Element.prototype
 * (jsdom has none at all — see the "I4 coalesced reorders" describe's afterEach
 * restore). */
interface MaybeAnimateProp {
  animate?: unknown;
}

/** The one page capability settleGlide needs: the harness's driver-backed
 * async flush (see MountedComponent.flushAsync). */
interface GlideFlusher {
  flushAsync(fn: () => Promise<void>): Promise<void>;
}
