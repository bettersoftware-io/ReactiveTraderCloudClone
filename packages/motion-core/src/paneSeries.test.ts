import { describe, expect, it } from "vitest";

import { macdValues, RSI_WINDOW, rsiValues } from "./paneSeries.js";

describe("rsiValues", () => {
  it("is null through the warm-up and lands at index 14", () => {
    const values = rsiValues(rampUp(30));
    expect(values.slice(0, 14)).toEqual(Array(14).fill(null));
    expect(values[14]).not.toBeNull();
  });

  it("clamps to 100 when every delta is a gain", () => {
    const values = rsiValues(rampUp(30));
    expect(values[20]).toBe(100);
  });

  it("is 0 when every delta is a loss", () => {
    const values = rsiValues(rampDown(30));
    expect(values[20]).toBe(0);
  });

  it("is exactly 50 for a flat series (the both-averages-zero arm)", () => {
    const values = rsiValues(Array(30).fill(100));

    for (let i = 14; i < 30; i++) {
      expect(values[i]).toBe(50);
    }
  });

  it("is exactly 50 at the seed, then oscillates near 50 for alternating ±1 deltas", () => {
    // The seed average (a plain mean over an even window with 7 gains and
    // 7 losses of magnitude 1) gives avgGain = avgLoss = 0.5 exactly, so
    // RS = 1 → RSI = 50 exactly at index 14. Wilder's exponential
    // smoothing does NOT preserve that symmetry step-by-step past the
    // seed — each single-step update weights the new (asymmetric) delta
    // 1/14 against the old (symmetric) 13/14, so the series settles into
    // a bounded oscillation around 50 (converging toward a 13/27 ↔ 14/27
    // avgGain/avgLoss 2-cycle, i.e. RSI ≈ 48.15/51.85) rather than
    // re-landing on exactly 50. Verified numerically before asserting.
    const values = rsiValues(zigzag(40));
    expect(values[14]).toBe(50);

    for (let i = 15; i < 40; i++) {
      expect(values[i]).toBeGreaterThan(45);
      expect(values[i]).toBeLessThan(55);
    }
  });

  it("is empty for an empty input and all-null when shorter than the window", () => {
    expect(rsiValues([])).toEqual([]);
    expect(rsiValues(rampUp(10))).toEqual(Array(10).fill(null));
  });

  it("is all-null when length is exactly the window (the <= boundary)", () => {
    expect(rsiValues(rampUp(RSI_WINDOW))).toEqual(Array(RSI_WINDOW).fill(null));
  });
});

describe("macdValues", () => {
  it("respects the null boundaries: macd at 25, signal and hist at 33", () => {
    const { macd, signal, hist } = macdValues(rampUp(40));
    expect(macd[24]).toBeNull();
    expect(macd[25]).not.toBeNull();
    expect(signal[32]).toBeNull();
    expect(signal[33]).not.toBeNull();
    expect(hist[32]).toBeNull();
    expect(hist[33]).not.toBeNull();
  });

  it("is all-zero for constant closes", () => {
    const { macd, signal, hist } = macdValues(Array(40).fill(100));
    expect(macd[30]).toBeCloseTo(0, 10);
    expect(signal[35]).toBeCloseTo(0, 10);
    expect(hist[35]).toBeCloseTo(0, 10);
  });

  it("is positive on a steady uptrend (fast EMA above slow)", () => {
    const { macd } = macdValues(rampUp(40));
    expect(macd[30]).toBeGreaterThan(0);
  });

  it("keeps hist ≡ macd − signal wherever both are defined", () => {
    const closes = pseudoRandomCloses(60);
    const { macd, signal, hist } = macdValues(closes);

    for (let i = 33; i < 60; i++) {
      expect(hist[i]).toBeCloseTo(
        (macd[i] as number) - (signal[i] as number),
        10,
      );
    }
  });

  it("is deterministic", () => {
    const closes = pseudoRandomCloses(60);
    expect(macdValues(closes)).toEqual(macdValues(closes));
  });
});

function rampUp(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    return 100 + i;
  });
}

function rampDown(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    return 100 - i;
  });
}

function zigzag(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    return 100 + (i % 2);
  });
}

/** Fixed LCG so the fixture is stable without Math.random. */
function pseudoRandomCloses(n: number): number[] {
  const out: number[] = [];
  let seed = 42;

  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    out.push(100 + (seed % 1000) / 100);
  }

  return out;
}
