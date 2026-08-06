import { firstValueFrom, from, lastValueFrom, type Subscription } from "rxjs";
import { take, toArray } from "rxjs/operators";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defined } from "../__testUtils__/defined.js";
import { KNOWN_CURRENCY_PAIRS } from "../fx/currencyPair.js";
import { PRICE_HISTORY_SIZE } from "../fx/price.js";
import {
  DEFAULT_ANOMALY_CONFIG,
  detectAnomalies,
} from "../jarvis/anomalyDetector.js";
import type { RfqQuoteResult } from "../ports/pricingPort.js";
import { PricingSimulator } from "./PricingSimulator.js";

const MAX_TICK_INTERVAL_MS = 1_000;

afterEach(() => {
  vi.useRealTimers();
});

describe("PricingSimulator", () => {
  it("getPriceHistory returns 50 ticks", async () => {
    const engine = new PricingSimulator();
    const history = await firstValueFrom(engine.getPriceHistory("EURUSD"));
    expect(history).toHaveLength(50);
  });

  it("each tick has correct structure", async () => {
    const engine = new PricingSimulator();
    const history = await firstValueFrom(engine.getPriceHistory("EURUSD"));
    const tick = history[0];

    expect(tick.symbol).toBe("EURUSD");
    expect(typeof tick.bid).toBe("number");
    expect(typeof tick.ask).toBe("number");
    expect(typeof tick.mid).toBe("number");
    expect(typeof tick.creationTimestamp).toBe("number");
    expect(typeof tick.valueDate).toBe("string");
  });

  it("ask/bid = mid ± half the pair's typical spread in pip units", async () => {
    const engine = new PricingSimulator();

    // EURUSD: pipsPosition 4 → pip unit 0.0001; spread 1.4 pips → half 0.00007
    const eur = await firstValueFrom(engine.getPriceHistory("EURUSD"));

    for (const tick of eur) {
      expect(tick.ask).toBeCloseTo(tick.mid + 0.00007, 10);
      expect(tick.bid).toBeCloseTo(tick.mid - 0.00007, 10);
    }

    // USDJPY: pipsPosition 2 → pip unit 0.01; spread 1.6 pips → half 0.008
    const jpy = await firstValueFrom(engine.getPriceHistory("USDJPY"));

    for (const tick of jpy) {
      expect(tick.ask).toBeCloseTo(tick.mid + 0.008, 10);
      expect(tick.bid).toBeCloseTo(tick.mid - 0.008, 10);
    }
  });

  it("initial mids stay within history-walk range of the PROTO base mid", async () => {
    const engine = new PricingSimulator();

    for (const pair of KNOWN_CURRENCY_PAIRS) {
      const history = await firstValueFrom(engine.getPriceHistory(pair.symbol));
      const stepSize = pair.pipsPosition === 2 ? 0.02 : 0.00018;
      // 50 history steps of at most stepSize/2 each from baseMid, plus up to
      // half an ulp of toFixed rounding per step — bound with full stepSize.
      const maxDrift = PRICE_HISTORY_SIZE * stepSize;

      for (const tick of history) {
        expect(
          Math.abs(tick.mid - pair.baseMid),
          pair.symbol,
        ).toBeLessThanOrEqual(maxDrift + 1e-9);
      }
    }
  });

  it("live mids respect the pair's rate precision", async () => {
    vi.useFakeTimers();
    const engine = new PricingSimulator();
    const ticksPromise = lastValueFrom(
      engine
        .getPriceUpdates("USDJPY")
        .pipe(take(PRICE_HISTORY_SIZE + 3), toArray()),
    );
    await vi.advanceTimersByTimeAsync(MAX_TICK_INTERVAL_MS * 5);
    const ticks = await ticksPromise;

    for (const tick of ticks.slice(PRICE_HISTORY_SIZE)) {
      expect(Number(tick.mid.toFixed(3))).toBe(tick.mid);
    }
  });

  it("history ticks are in chronological order", async () => {
    const engine = new PricingSimulator();
    const history = await firstValueFrom(engine.getPriceHistory("EURUSD"));

    for (let i = 1; i < history.length; i++) {
      expect(history[i].creationTimestamp).toBeGreaterThanOrEqual(
        history[i - 1].creationTimestamp,
      );
    }
  });

  it("getPriceUpdates yields initial history then new ticks", async () => {
    vi.useFakeTimers();
    const engine = new PricingSimulator();
    const promise = lastValueFrom(
      engine
        .getPriceUpdates("EURUSD")
        .pipe(take(PRICE_HISTORY_SIZE + 2), toArray()),
    );
    // Drive the live tick scheduler — random interval is bounded by MAX_TICK_INTERVAL_MS.
    await vi.advanceTimersByTimeAsync(MAX_TICK_INTERVAL_MS * 4);
    const ticks = await promise;
    expect(ticks.length).toBeGreaterThanOrEqual(PRICE_HISTORY_SIZE + 2);
    expect(ticks[0].symbol).toBe("EURUSD");
  });

  it("getRfqQuote widens the spread", async () => {
    vi.useFakeTimers();
    const engine = new PricingSimulator();
    const promise = firstValueFrom(engine.getRfqQuote("EURUSD", 4));
    // Advance past the maximum possible delay (999ms ceiling).
    await vi.advanceTimersByTimeAsync(1000);
    const quote = await promise;

    // priceChange = 0.3 / 10^4 = 0.00003; EURUSD half-spread = 0.00007
    const expectedAsk = quote.mid + 0.00007 + 0.00003;
    const expectedBid = quote.mid - 0.00007 - 0.00003;
    expect(quote.ask).toBeCloseTo(expectedAsk, 8);
    expect(quote.bid).toBeCloseTo(expectedBid, 8);
  });

  it("emits the RFQ quote after a 500–999 ms delay", async () => {
    vi.useFakeTimers();

    try {
      const sim = new PricingSimulator();
      const symbol = "EURUSD";
      let received: RfqQuoteResult | undefined;
      const sub: Subscription = sim.getRfqQuote(symbol, 4).subscribe((q) => {
        received = q;
      });
      // Below the 500ms floor — must not have emitted yet.
      await vi.advanceTimersByTimeAsync(499);
      expect(received).toBeUndefined();
      // Past the 999ms ceiling — must have emitted exactly once by now.
      await vi.advanceTimersByTimeAsync(500);
      expect(received).toBeDefined();
      expect(defined(received).bid).toBeLessThan(defined(received).ask);
      sub.unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it("throws for unknown symbol", async () => {
    const engine = new PricingSimulator();
    await expect(
      firstValueFrom(engine.getPriceHistory("INVALID")),
    ).rejects.toThrow("Unknown symbol");
  });

  it("getPriceUpdates throws for unknown symbol", async () => {
    const engine = new PricingSimulator();
    await expect(
      firstValueFrom(engine.getPriceUpdates("INVALID")),
    ).rejects.toThrow("Unknown symbol");
  });

  it("getRfqQuote throws for unknown symbol", async () => {
    const engine = new PricingSimulator();
    await expect(
      firstValueFrom(engine.getRfqQuote("INVALID", 4)),
    ).rejects.toThrow("Unknown symbol");
  });

  it("live ticks keep the price history capped at PRICE_HISTORY_SIZE", async () => {
    vi.useFakeTimers();
    const engine = new PricingSimulator();
    const consumed = lastValueFrom(
      engine
        .getPriceUpdates("EURUSD")
        .pipe(take(PRICE_HISTORY_SIZE + 10), toArray()),
    );
    await vi.advanceTimersByTimeAsync(MAX_TICK_INTERVAL_MS * 12);
    await consumed;
    const history = await firstValueFrom(engine.getPriceHistory("EURUSD"));
    expect(history).toHaveLength(PRICE_HISTORY_SIZE);
  });

  it("history never grows beyond PRICE_HISTORY_SIZE after a single live tick", async () => {
    vi.useFakeTimers();
    const engine = new PricingSimulator();
    // Subscribe and wait for exactly one live tick beyond the initial history batch.
    // After the first live tick the internal history array is pushed to 51 items and
    // immediately shifted back to 50 — the `if (> PRICE_HISTORY_SIZE) shift()` branch.
    const liveTicks = lastValueFrom(
      engine.getPriceUpdates("EURUSD").pipe(
        take(PRICE_HISTORY_SIZE + 1), // 50 history + 1 live
        toArray(),
      ),
    );
    await vi.advanceTimersByTimeAsync(MAX_TICK_INTERVAL_MS * 2);
    await liveTicks;
    const history = await firstValueFrom(engine.getPriceHistory("EURUSD"));
    // The shift() path must have fired: length must still equal the cap, not 51.
    expect(history).toHaveLength(PRICE_HISTORY_SIZE);
    expect(history.length).not.toBeGreaterThan(PRICE_HISTORY_SIZE);
  });

  // --- Anomaly-episode wiring (Task 7b) -----------------------------------
  //
  // The pure episode-advance logic (forced start, ramp shape, decay, bounds,
  // and the RNG-consumption byte-compat guarantee — ZERO extra draws when
  // `startProbability` is forced to 0) is unit-tested directly against
  // `pricingAnomalyEpisode.ts`; that is the ONLY place the "byte-compatible"
  // claim is proven, because it is the only test that can control draw
  // COUNT independent of draw VALUE. These three tests instead pin the
  // wiring into `PricingSimulator` itself: that the pre-episode formula
  // still computes the same numbers when no episode is active (a narrower
  // claim than draw-count compatibility — see the test's own docstring),
  // that a forced episode visibly widens the live spread, and that a forced
  // episode's real tick stream trips the real `detectAnomalies`.

  it("steady-state formula wiring: live tick mids match the pre-episode random-walk formula under a constant Math.random()", async () => {
    // NOTE what this test does and does NOT prove: Math.random() is mocked
    // to a CONSTANT (0.9), so it is draw-COUNT-insensitive by construction —
    // the same constant is returned no matter how many times it's called,
    // so this cannot detect (and does not claim to detect) that the shipped
    // `DEFAULT_EPISODE_CONFIG` consumes one extra "start roll" draw per
    // steady-state tick versus the pre-episode code (measured: 2 draws/tick
    // -> 3, i.e. +50% — see pricingAnomalyEpisode.ts's module doc for why
    // that's harmless). What THIS test proves is narrower: that the
    // arithmetic formula itself — mid = mid + (r-0.5)*stepSize, rounded to
    // ratePrecision — still produces the exact pre-episode numbers when no
    // episode is active, wired through the class's public surface. The
    // actual zero-extra-draws guarantee is pinned at the pure-function
    // level in pricingAnomalyEpisode.test.ts ("byte-compatible steady
    // state"), the only test that can hold draw count and draw value
    // independent of each other.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.9); // 0.9 << 1/1500 crossed only from below; never starts an episode
    vi.useFakeTimers();

    try {
      const engine = new PricingSimulator();
      const ticksPromise = lastValueFrom(
        engine
          .getPriceUpdates("EURUSD")
          .pipe(take(PRICE_HISTORY_SIZE + 5), toArray()),
      );
      await vi.advanceTimersByTimeAsync(MAX_TICK_INTERVAL_MS * 6);
      const ticks = await ticksPromise;

      // Manual replication of the PRE-EPISODE formula: mid = mid + (r -
      // 0.5) * stepSize, rounded to ratePrecision, seeded from EURUSD's
      // baseMid/stepSize/ratePrecision (1.09213 / 0.00018 / 5).
      const stepSize = 0.00018;
      const ratePrecision = 5;
      const halfSpread = 0.00007;
      let mid = 1.09213;
      const r = 0.9 - 0.5;
      const expectedMids: number[] = [];

      for (let i = 0; i < ticks.length; i++) {
        const next = mid + r * stepSize;
        const rounded = Number(next.toFixed(ratePrecision));
        mid = rounded > 0 ? rounded : mid;
        expectedMids.push(mid);
      }

      expect(
        ticks.map((t) => {
          return t.mid;
        }),
      ).toEqual(expectedMids);

      for (const tick of ticks) {
        expect(tick.ask).toBeCloseTo(tick.mid + halfSpread, 10);
        expect(tick.bid).toBeCloseTo(tick.mid - halfSpread, 10);
      }
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("a forced continuous episode visibly widens the live ask-bid spread beyond the resting baseline, bounded by the configured peak", async () => {
    // Math.random() === 0 always wins the start roll (0 < 1/1500) AND
    // always rolls the minimum duration (20), spreadWidening (not
    // volBurst), and the range's minimum peak factor (2x) — a fully
    // deterministic, continuously-repeating spreadWidening episode.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    vi.useFakeTimers();

    try {
      const engine = new PricingSimulator();
      const ticksPromise = lastValueFrom(
        engine
          .getPriceUpdates("EURUSD")
          .pipe(take(PRICE_HISTORY_SIZE + 15), toArray()),
      );
      await vi.advanceTimersByTimeAsync(MAX_TICK_INTERVAL_MS * 20);
      const ticks = await ticksPromise;
      const liveTicks = ticks.slice(PRICE_HISTORY_SIZE);

      const restingSpread = 0.00007 * 2; // EURUSD half-spread * 2
      const widened = liveTicks.filter((t) => {
        return t.ask - t.bid > restingSpread + 1e-9;
      });
      expect(widened.length).toBeGreaterThan(0);

      // Bounded: never exceeds the pinned peak factor (2x, from
      // spreadPeakRange[0], since every roll above lands on the range's
      // minimum with a constant-0 random()).
      for (const t of liveTicks) {
        expect(t.ask - t.bid).toBeLessThanOrEqual(restingSpread * 2 + 1e-9);
      }
    } finally {
      randomSpy.mockRestore();
    }
  });

  it("a forced episode's REAL live tick stream (through the actual PricingSimulator class, not a reimplemented walk) trips detectAnomalies' spreadWidening channel", async () => {
    // Same forcing technique as the test above (Math.random() === 0 always
    // wins the start roll and always rolls minDuration/spreadWidening/
    // minPeak), but this time the resulting PriceTick[] — collected from
    // the actual class, including its real `.toFixed(ratePrecision)`
    // rounding — is piped through the real, unmodified `detectAnomalies`
    // with the real `DEFAULT_ANOMALY_CONFIG`. This is the end-to-end proof
    // that the shipped simulator (not a hand-rolled stand-in) can trigger
    // the detector; `pricingAnomalyEpisode.test.ts`'s "detector
    // integration" cases prove the episode SHAPE crosses 3σ (including the
    // volSpike/volBurst channel) against a sequence built directly from the
    // pure functions — this test is that proof's real-class witness for
    // the spreadWidening channel.
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    vi.useFakeTimers();

    try {
      const engine = new PricingSimulator();
      // minWindowFill (60) + enough live ticks for several ramp cycles
      // (episodes repeat back-to-back at duration 20 under this mock).
      const ticksPromise = lastValueFrom(
        engine
          .getPriceUpdates("EURUSD")
          .pipe(take(PRICE_HISTORY_SIZE + 70), toArray()),
      );
      await vi.advanceTimersByTimeAsync(MAX_TICK_INTERVAL_MS * 80);
      const ticks = await ticksPromise;

      const events = await lastValueFrom(
        detectAnomalies(from(ticks), DEFAULT_ANOMALY_CONFIG).pipe(toArray()),
      );

      const spreadEvents = events.filter((e) => {
        return e.kind === "spreadWidening";
      });

      expect(spreadEvents.length).toBeGreaterThanOrEqual(1);

      for (const e of spreadEvents) {
        expect(e.symbol).toBe("EURUSD");
        expect(e.sigma).toBeGreaterThanOrEqual(
          DEFAULT_ANOMALY_CONFIG.spreadSigma,
        );
      }
    } finally {
      randomSpy.mockRestore();
    }
  });
});
