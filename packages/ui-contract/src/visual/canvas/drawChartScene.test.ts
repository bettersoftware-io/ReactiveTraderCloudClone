import { describe, expect, it } from "vitest";

import type { ChartScene, SceneCandle, SceneGridLine } from "@rtc/motion-core";

import { drawChartScene, SPIKE_PALETTE, spikeScene } from "./drawChartScene.js";

const gridLine: SceneGridLine = { key: 0, top: 40 };

const upCandle: SceneCandle = {
  key: 0,
  up: true,
  last: false,
  glow: false,
  x: 25,
  top: 20,
  h: 30,
  w: 10,
  wickX: 25,
  wickTop: 10,
  wickH: 50,
};

const downCandle: SceneCandle = {
  key: 1,
  up: false,
  last: true,
  glow: false,
  x: 75,
  top: 40,
  h: 20,
  w: 8,
  wickX: 75,
  wickTop: 35,
  wickH: 30,
};

const twoCandleScene: ChartScene = {
  kind: "candles",
  candles: [upCandle, downCandle],
  grid: [gridLine],
  priceLabels: [],
  timeLabels: [],
  linePoints: [],
  scale: { cmin: 0, cmax: 0 },
};

const SIZE = { w: 100, h: 100 };

describe("drawChartScene", () => {
  it("clears the canvas first", () => {
    const { ctx, calls } = recorderCtx();
    drawChartScene(ctx, twoCandleScene, SPIKE_PALETTE, SIZE);
    expect(calls[0]).toEqual({ op: "clearRect", args: [0, 0, 100, 100] });
  });

  it("strokes a grid line at the scene's percent-of-height y", () => {
    const { ctx, calls } = recorderCtx();
    drawChartScene(ctx, twoCandleScene, SPIKE_PALETTE, SIZE);
    const beginPathIdx = calls.findIndex((c) => {
      return c.op === "beginPath";
    });
    expect(calls[beginPathIdx + 1]).toEqual({ op: "moveTo", args: [0, 40] });
    expect(calls[beginPathIdx + 2]).toEqual({ op: "lineTo", args: [100, 40] });
    expect(calls[beginPathIdx + 3]).toEqual({ op: "stroke", args: [] });
  });

  it("draws each candle's wick as a 1px-wide fillRect centered on wickX", () => {
    const { ctx, calls } = recorderCtx();
    drawChartScene(ctx, twoCandleScene, SPIKE_PALETTE, SIZE);
    const wickRects = calls.filter((c) => {
      return c.op === "fillRect";
    });
    // First two fillRects are the wicks (drawn before the bodies), at
    // x - 0.5 (percent == px at size 100), width 1, top/height from
    // wickTop/wickH.
    expect(wickRects[0]).toEqual({
      op: "fillRect",
      args: [24.5, 10, 1, 50],
    });
    expect(wickRects[1]).toEqual({
      op: "fillRect",
      args: [74.5, 35, 1, 30],
    });
  });

  it("draws each candle's body as a fillRect centered on x, in up/down palette order", () => {
    const { ctx, calls } = recorderCtx();
    drawChartScene(ctx, twoCandleScene, SPIKE_PALETTE, SIZE);
    const fillStyleCalls = calls.filter((c) => {
      return c.op === "fillStyle";
    });
    // First fillStyle set is the shared wick color; the next two are the
    // per-candle body colors, in up-then-down order (matching candle order).
    expect(fillStyleCalls[0]).toEqual({
      op: "fillStyle",
      args: [SPIKE_PALETTE.wick],
    });
    expect(fillStyleCalls[1]).toEqual({
      op: "fillStyle",
      args: [SPIKE_PALETTE.bodyUp],
    });
    expect(fillStyleCalls[2]).toEqual({
      op: "fillStyle",
      args: [SPIKE_PALETTE.bodyDown],
    });

    const fillRects = calls.filter((c) => {
      return c.op === "fillRect";
    });
    // Bodies are drawn after both wicks: index 2 = up candle, index 3 = down.
    expect(fillRects[2]).toEqual({ op: "fillRect", args: [20, 20, 10, 30] });
    expect(fillRects[3]).toEqual({ op: "fillRect", args: [71, 40, 8, 20] });
  });

  it("draws no text (geometry only)", () => {
    const { ctx, calls } = recorderCtx();
    drawChartScene(ctx, twoCandleScene, SPIKE_PALETTE, SIZE);
    expect(
      calls.some((c) => {
        return c.op === "fillText" || c.op === "strokeText";
      }),
    ).toBe(false);
  });
});

describe("spikeScene", () => {
  it("returns a non-empty candles array", () => {
    const scene = spikeScene();
    expect(scene.candles.length).toBeGreaterThan(0);
  });

  it("is deterministic across calls", () => {
    expect(spikeScene()).toEqual(spikeScene());
  });
});

interface RecordedCall {
  readonly op: string;
  readonly args: readonly (number | string)[];
}

interface RecorderCtx {
  ctx: CanvasRenderingContext2D;
  calls: RecordedCall[];
}

// Fake CanvasRenderingContext2D: records every call it sees instead of
// touching a real canvas, so the engine's geometry can be pinned without a
// DOM/jsdom canvas backend (jsdom's canvas is unimplemented anyway).
function recorderCtx(): RecorderCtx {
  const calls: RecordedCall[] = [];
  let fillStyle = "";
  const target = {
    set fillStyle(v: string) {
      fillStyle = v;
      calls.push({ op: "fillStyle", args: [v] });
    },
    get fillStyle(): string {
      return fillStyle;
    },
  } as Record<string, unknown>;

  for (const op of [
    "clearRect",
    "fillRect",
    "beginPath",
    "moveTo",
    "lineTo",
    "stroke",
  ]) {
    target[op] = (...args: number[]): void => {
      calls.push({ op, args });
    };
  }

  target.strokeStyle = "";
  target.lineWidth = 0;
  return { ctx: target as unknown as CanvasRenderingContext2D, calls };
}
