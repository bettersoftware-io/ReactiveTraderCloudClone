import { describe, expect, it } from "vitest";

import type { ChartViewport } from "./chartViewport.js";
import {
  PANE_Y_SPAN,
  PANE_Y_TOP,
  paneReadout,
  paneScene,
} from "./paneScene.js";
import { macdValues } from "./paneSeries.js";

describe("paneScene: rsi", () => {
  it("places the 70/30 guides at the fixed 0-100 inverted scale's y coordinates", () => {
    const scene = paneScene("rsi", rampUp(30), { start: 0, end: 30 });

    expect(scene.guides).toEqual([
      { key: 0, y: 33.2 },
      { key: 1, y: 66.8 },
    ]);
  });

  it("has one line keyed 'rsi' and an empty histogram", () => {
    const scene = paneScene("rsi", rampUp(30), { start: 0, end: 30 });

    expect(scene.lines).toHaveLength(1);
    expect(scene.lines[0]?.key).toBe("rsi");
    expect(scene.histogram).toEqual([]);
  });

  it("skips the RSI warm-up: no points before index 14 of a 20-close series", () => {
    const scene = paneScene("rsi", rampUp(20), { start: 0, end: 20 });

    // RSI_WINDOW = 14, so indices 14..19 are defined: 6 points.
    expect(scene.lines[0]?.points).toHaveLength(6);
  });

  it("maps a known RSI value through the fixed scale (v=100 -> y=8)", () => {
    const scene = paneScene("rsi", rampUp(30), { start: 0, end: 30 });
    const first = scene.lines[0]?.points[0];

    // rampUp is a strict uptrend: RSI clamps to 100 from the seed onward.
    expect(first?.y).toBeCloseTo(PANE_Y_TOP, 10);
  });

  it("only includes indices inside the viewport window", () => {
    const scene = paneScene("rsi", rampUp(30), { start: 20, end: 25 });

    expect(scene.lines[0]?.points).toHaveLength(5);
  });

  it("x matches the shared viewport mapping for each point's index", () => {
    const viewport: ChartViewport = { start: 10, end: 30 };
    const scene = paneScene("rsi", rampUp(30), viewport);
    const span = viewport.end - viewport.start;
    const first = scene.lines[0]?.points[0];

    // First defined RSI index is 14 (RSI_WINDOW).
    expect(first?.x).toBeCloseTo(((14 + 0.5 - 10) / span) * 100, 10);
  });
});

describe("paneScene: macd", () => {
  it("scales symmetrically so constant closes land the zero guide mid-band", () => {
    const scene = paneScene("macd", Array(40).fill(100), {
      start: 0,
      end: 40,
    });

    expect(scene.guides).toEqual([{ key: 0, y: PANE_Y_TOP + PANE_Y_SPAN / 2 }]);
  });

  it("has macd/signal lines in that key order", () => {
    const scene = paneScene("macd", pseudoRandomCloses(60), {
      start: 0,
      end: 60,
    });

    expect(
      scene.lines.map((l) => {
        return l.key;
      }),
    ).toEqual(["macd", "signal"]);
  });

  it("skips the macd/signal/hist warm-up, keeping their differing start indices", () => {
    const scene = paneScene("macd", rampUp(40), { start: 0, end: 40 });

    // macd defined 25..39 (15), signal/hist defined 33..39 (7).
    expect(scene.lines[0]?.points).toHaveLength(15);
    expect(scene.lines[1]?.points).toHaveLength(7);
    expect(scene.histogram).toHaveLength(7);
  });

  it("produces one histogram bar per defined hist index, keyed by that index", () => {
    const viewport: ChartViewport = { start: 0, end: 60 };
    const scene = paneScene("macd", pseudoRandomCloses(60), viewport);

    // hist is defined from index 33 onward: 60 - 33 = 27 bars.
    expect(scene.histogram).toHaveLength(27);
    const bar = scene.histogram[0];
    expect(bar?.key).toBe(33);
    expect(bar?.x).toBeCloseTo(((33 + 0.5) / 60) * 100, 10);
    expect(bar?.w).toBeCloseTo((100 / 60) * 0.64, 10);
  });

  it("derives bar height from |y(hist) - y(0)| and up from hist's sign", () => {
    const viewport: ChartViewport = { start: 0, end: 60 };
    const closes = pseudoRandomCloses(60);
    const scene = paneScene("macd", closes, viewport);
    const { macd, signal, hist } = macdValues(closes);

    let m = 0;

    for (let i = 0; i < 60; i++) {
      m = Math.max(
        m,
        Math.abs(macd[i] ?? 0),
        Math.abs(signal[i] ?? 0),
        Math.abs(hist[i] ?? 0),
      );
    }

    m = m || 1;

    function yOf(v: number): number {
      return ((m - v) / (2 * m)) * PANE_Y_SPAN + PANE_Y_TOP;
    }

    const yZero = yOf(0);

    scene.histogram.forEach((bar, offset) => {
      const i = 33 + offset;
      const h = hist[i] as number;
      expect(bar.key).toBe(i);
      expect(bar.h).toBeCloseTo(Math.abs(yOf(h) - yZero), 10);
      expect(bar.up).toBe(h >= 0);
    });
  });

  it("excludes histogram bars for indices outside the viewport", () => {
    const scene = paneScene("macd", pseudoRandomCloses(60), {
      start: 40,
      end: 50,
    });

    expect(
      scene.histogram.every((bar) => {
        return bar.key >= 40 && bar.key < 50;
      }),
    ).toBe(true);
    expect(scene.histogram.length).toBeGreaterThan(0);
  });
});

describe("paneReadout", () => {
  it("formats RSI to 1 decimal", () => {
    expect(paneReadout("rsi", rampUp(30), 20)).toEqual([
      { label: "RSI", txt: "100.0" },
    ]);
  });

  it("formats MACD/SIG/HIST to 2 decimals, labelled MACD/SIG/HIST", () => {
    expect(paneReadout("macd", Array(40).fill(100), 35)).toEqual([
      { label: "MACD", txt: "0.00" },
      { label: "SIG", txt: "0.00" },
      { label: "HIST", txt: "0.00" },
    ]);
  });

  it("renders warm-up indices as the literal em-dash glyph", () => {
    const closes = rampUp(30);

    expect(paneReadout("rsi", closes, 0)).toEqual([{ label: "RSI", txt: "—" }]);
    expect(paneReadout("macd", closes, 0)).toEqual([
      { label: "MACD", txt: "—" },
      { label: "SIG", txt: "—" },
      { label: "HIST", txt: "—" },
    ]);
  });
});

function rampUp(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    return 100 + i;
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
