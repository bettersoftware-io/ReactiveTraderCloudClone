import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type {
  ChartCandle,
  ChartScene,
  CrosshairScene,
  SceneCandle,
} from "./chartScene.js";
import { chartScene, crosshairScene, volumeScene } from "./chartScene.js";
import type { ChartViewport } from "./chartViewport.js";
import {
  type Canvas2D,
  type CanvasGradient2D,
  CHART_PALETTE_TOKENS,
  type ChartPalette,
  drawPaneScene,
  drawPlotScene,
  drawVolumeScene,
  type OverlayLine,
  type PlotCanvasScene,
} from "./drawChartScene.js";
import type { Drawing, DrawingSceneItem } from "./drawingScene.js";
import { drawingScene } from "./drawingScene.js";
import { paneScene } from "./paneScene.js";

const SIZE = { w: 100, h: 100 };
const BUCKET_MS = 60_000;

const PALETTE: ChartPalette = {
  up: "up-color",
  down: "down-color",
  grid: "grid-color",
  line: "line-color",
  sma20: "sma20-color",
  ema50: "ema50-color",
  compare: "compare-color",
  drawing: "drawing-color",
  drawingLevel: "drawing-level-color",
  grip: "grip-color",
  crosshair: "crosshair-color",
  paneRsi: "pane-rsi-color",
  paneMacd: "pane-macd-color",
  paneSignal: "pane-signal-color",
  paneGuide: "pane-guide-color",
  histogram: "histogram-color",
};

const CANDLE_COUNT = 6;
const CANDLES: readonly ChartCandle[] = Array.from(
  { length: CANDLE_COUNT },
  (_, i) => {
    return candleAt(i);
  },
);
const LIVE_RATE: number = CANDLES[CANDLES.length - 1].close;
const VIEWPORT: ChartViewport = { start: 0, end: CANDLES.length };

const COMPARE_CANDLES: readonly ChartCandle[] = CANDLES.map((_, i) => {
  return compareCandleAt(i);
});

const candleChartScene = chartScene(CANDLES, LIVE_RATE, true);
const lineScene = chartScene(CANDLES, LIVE_RATE, false, { kind: "line" });
const areaScene = chartScene(CANDLES, LIVE_RATE, false, { kind: "area" });
const compareScene = chartScene(CANDLES, LIVE_RATE, false, {
  kind: "line",
  compare: { series: COMPARE_CANDLES },
});

const OVERLAYS: readonly OverlayLine[] = [
  {
    id: "sma20",
    points: [
      { x: 0, y: 10 },
      { x: 100, y: 20 },
    ],
  },
  {
    id: "ema50",
    points: [
      { x: 0, y: 30 },
      { x: 100, y: 40 },
    ],
  },
  {
    id: "mystery-overlay",
    points: [
      { x: 0, y: 50 },
      { x: 100, y: 60 },
    ],
  },
];

const DRAWINGS_INPUT: readonly Drawing[] = [
  {
    id: "draft",
    kind: "trendline",
    a: { index: 0, price: candleAt(0).low },
    b: { index: CANDLES.length - 1, price: candleAt(CANDLES.length - 1).high },
  },
  { id: "h1", kind: "hline", price: 100 },
];

const drawingsScene: readonly DrawingSceneItem[] = drawingScene(
  DRAWINGS_INPUT,
  VIEWPORT,
  candleChartScene.scale,
  "draft",
);

const crosshair: CrosshairScene | null = crosshairScene(
  0.5,
  0.5,
  CANDLES,
  VIEWPORT,
  candleChartScene.scale,
);

describe("drawPlotScene: candles", () => {
  const plot = plotOf(candleChartScene);
  const candles: readonly SceneCandle[] = candleChartScene.candles;

  it("clears the canvas exactly once", () => {
    const { ctx, calls } = recorderCtx();
    drawPlotScene(ctx, plot, PALETTE, SIZE);
    expect(calls[0]).toEqual({ op: "clearRect", args: [0, 0, 100, 100] });
    expect(
      calls.filter((c) => {
        return c.op === "clearRect";
      }),
    ).toHaveLength(1);
  });

  it("strokes one grid line per scene.grid entry using palette.grid", () => {
    expect(candleChartScene.grid.length).toBeGreaterThan(0);
    const { ctx, calls } = recorderCtx();
    drawPlotScene(ctx, plot, PALETTE, SIZE);

    const gridStrokeStyle = calls.find((c) => {
      return c.op === "strokeStyle" && c.args[0] === PALETTE.grid;
    });
    expect(gridStrokeStyle).toBeDefined();

    const strokeCount = calls.filter((c) => {
      return c.op === "stroke";
    }).length;
    expect(strokeCount).toBe(candleChartScene.grid.length);
  });

  it("draws each candle's wick then body fillRect, colored by up/down", () => {
    const { ctx, calls } = recorderCtx();
    drawPlotScene(ctx, plot, PALETTE, SIZE);

    const fillRects = calls.filter((c) => {
      return c.op === "fillRect";
    });
    expect(fillRects).toHaveLength(candles.length * 2);

    const fillStyles = calls.filter((c) => {
      return c.op === "fillStyle";
    });
    expect(fillStyles).toHaveLength(candles.length);
    expect(
      fillStyles.map((c) => {
        return c.args[0];
      }),
    ).toEqual(
      candles.map((cd) => {
        return cd.up ? PALETTE.up : PALETTE.down;
      }),
    );

    const first = candles[0];
    expectNumericCall(fillRects[0], "fillRect", [
      first.wickX - 0.5,
      first.wickTop,
      1,
      first.wickH,
    ]);
    expectNumericCall(fillRects[1], "fillRect", [
      first.x - first.w / 2,
      first.top,
      first.w,
      first.h,
    ]);
  });

  it("glows the flashing last candle: shadowBlur 8 + shadowColor before its body, reset to 0 after", () => {
    const lastCandle = candles[candles.length - 1];
    expect(lastCandle.glow).toBe(true);
    const lastColor = lastCandle.up ? PALETTE.up : PALETTE.down;

    const { ctx, calls } = recorderCtx();
    drawPlotScene(ctx, plot, PALETTE, SIZE);

    expect(
      calls.filter((c) => {
        return c.op === "shadowBlur";
      }),
    ).toEqual([
      { op: "shadowBlur", args: [8] },
      { op: "shadowBlur", args: [0] },
    ]);
    expect(
      calls.filter((c) => {
        return c.op === "shadowColor";
      }),
    ).toEqual([{ op: "shadowColor", args: [lastColor] }]);

    const blurOnIdx = calls.findIndex((c) => {
      return c.op === "shadowBlur";
    });

    const bodyFillRectIdx = calls.findIndex((c, i) => {
      return i > blurOnIdx && c.op === "fillRect";
    });

    const blurOffIdx = calls.findIndex((c, i) => {
      return i > bodyFillRectIdx && c.op === "shadowBlur";
    });
    expect(blurOnIdx).toBeGreaterThanOrEqual(0);
    expect(bodyFillRectIdx).toBeGreaterThan(blurOnIdx);
    expect(blurOffIdx).toBeGreaterThan(bodyFillRectIdx);
  });
});

describe("drawPlotScene: line", () => {
  const plot = plotOf(lineScene);

  it("draws no candle rects and strokes one polyline over linePoints at lineWidth 1.5", () => {
    const { ctx, calls } = recorderCtx();
    drawPlotScene(ctx, plot, PALETTE, SIZE);

    expect(
      calls.some((c) => {
        return c.op === "fillRect";
      }),
    ).toBe(false);

    const lineStrokeStyleIdx = calls.findIndex((c) => {
      return c.op === "strokeStyle" && c.args[0] === PALETTE.line;
    });
    expect(lineStrokeStyleIdx).toBeGreaterThanOrEqual(0);

    const lineWidthAfter = calls.slice(lineStrokeStyleIdx).find((c) => {
      return c.op === "lineWidth";
    });
    expect(lineWidthAfter).toEqual({ op: "lineWidth", args: [1.5] });

    const strokeCount = calls.filter((c) => {
      return c.op === "stroke";
    }).length;
    expect(strokeCount).toBe(lineScene.grid.length + 1);

    const totalLineTo = calls.filter((c) => {
      return c.op === "lineTo";
    }).length;
    expect(totalLineTo).toBe(
      lineScene.grid.length + (lineScene.linePoints.length - 1),
    );

    const lastMoveTo = calls
      .filter((c) => {
        return c.op === "moveTo";
      })
      .at(-1);
    const firstPoint = lineScene.linePoints[0];
    expectNumericCall(lastMoveTo, "moveTo", [firstPoint.x, firstPoint.y]);

    const lastLineTo = calls
      .filter((c) => {
        return c.op === "lineTo";
      })
      .at(-1);
    const lastPoint = lineScene.linePoints[lineScene.linePoints.length - 1];
    expectNumericCall(lastLineTo, "lineTo", [lastPoint.x, lastPoint.y]);
  });
});

describe("drawPlotScene: area", () => {
  const plot = plotOf(areaScene);

  it("fills the area under the line with a gradient at 0.35 alpha closed to the bottom edge, then strokes the line on top", () => {
    const { ctx, calls } = recorderCtx();
    drawPlotScene(ctx, plot, PALETTE, SIZE);

    expect(
      calls.find((c) => {
        return c.op === "createLinearGradient";
      }),
    ).toEqual({
      op: "createLinearGradient",
      args: [0, 0, 0, 100],
    });

    expect(
      calls.filter((c) => {
        return c.op === "addColorStop";
      }),
    ).toEqual([
      { op: "addColorStop", args: [0, PALETTE.line] },
      { op: "addColorStop", args: [1, "transparent"] },
    ]);

    expect(
      calls
        .filter((c) => {
          return c.op === "globalAlpha";
        })
        .map((c) => {
          return c.args[0];
        }),
    ).toEqual([0.35, 1]);

    const gradientFillStyleCalls = calls.filter((c) => {
      return c.op === "fillStyle" && typeof c.args[0] === "object";
    });
    expect(gradientFillStyleCalls).toHaveLength(1);

    const bottomEdgeLineTos = calls.filter((c) => {
      return c.op === "lineTo" && c.args[1] === 100;
    });
    expect(bottomEdgeLineTos).toHaveLength(2);

    expect(
      calls.filter((c) => {
        return c.op === "closePath";
      }),
    ).toHaveLength(1);
    expect(
      calls.filter((c) => {
        return c.op === "fill";
      }),
    ).toHaveLength(1);

    const fillIdx = calls.findIndex((c) => {
      return c.op === "fill";
    });

    const lineStrokeStyleIdx = calls.findIndex((c) => {
      return c.op === "strokeStyle" && c.args[0] === PALETTE.line;
    });
    expect(fillIdx).toBeLessThan(lineStrokeStyleIdx);

    const strokeCount = calls.filter((c) => {
      return c.op === "stroke";
    }).length;
    expect(strokeCount).toBe(areaScene.grid.length + 1);
  });
});

describe("drawPlotScene: compare overlay", () => {
  it("strokes the compare line in palette.compare when compareLinePoints is non-empty", () => {
    expect(compareScene.compareLinePoints.length).toBeGreaterThan(0);
    const { ctx, calls } = recorderCtx();
    drawPlotScene(ctx, plotOf(compareScene), PALETTE, SIZE);
    expect(
      calls.some((c) => {
        return c.op === "strokeStyle" && c.args[0] === PALETTE.compare;
      }),
    ).toBe(true);
  });

  it("omits the compare pass when compareLinePoints is empty", () => {
    expect(lineScene.compareLinePoints).toEqual([]);
    const { ctx, calls } = recorderCtx();
    drawPlotScene(ctx, plotOf(lineScene), PALETTE, SIZE);
    expect(
      calls.some((c) => {
        return c.op === "strokeStyle" && c.args[0] === PALETTE.compare;
      }),
    ).toBe(false);
  });
});

describe("drawPlotScene: overlays", () => {
  it("strokes one polyline per overlay, id-keyed to sma20/ema50, unknown id falling back to palette.line", () => {
    const { ctx, calls } = recorderCtx();
    drawPlotScene(ctx, plotOf(candleChartScene, OVERLAYS), PALETTE, SIZE);

    const strokeStyleValues = calls
      .filter((c) => {
        return c.op === "strokeStyle";
      })
      .map((c) => {
        return c.args[0];
      });

    expect(
      strokeStyleValues.filter((v) => {
        return v === PALETTE.sma20;
      }),
    ).toHaveLength(1);
    expect(
      strokeStyleValues.filter((v) => {
        return v === PALETTE.ema50;
      }),
    ).toHaveLength(1);
    expect(
      strokeStyleValues.filter((v) => {
        return v === PALETTE.line;
      }),
    ).toHaveLength(1);
  });
});

describe("drawPlotScene: drawings", () => {
  it("strokes a trendline with palette.drawing, an hline with palette.drawingLevel, dashes only the draft item, and fills grip handles", () => {
    const draft = drawingsScene.find((d) => {
      return d.id === "draft";
    });
    expect(draft?.handles.length).toBeGreaterThan(0);

    const { ctx, calls } = recorderCtx();
    drawPlotScene(
      ctx,
      plotOf(candleChartScene, [], drawingsScene),
      PALETTE,
      SIZE,
    );

    const strokeStyleValues = calls
      .filter((c) => {
        return c.op === "strokeStyle";
      })
      .map((c) => {
        return c.args[0];
      });
    expect(strokeStyleValues).toContain(PALETTE.drawing);
    expect(strokeStyleValues).toContain(PALETTE.drawingLevel);

    expect(
      calls.filter((c) => {
        return c.op === "setLineDash";
      }),
    ).toEqual([
      { op: "setLineDash", args: [[4, 4]] },
      { op: "setLineDash", args: [[]] },
    ]);

    const arcCalls = calls.filter((c) => {
      return c.op === "arc";
    });
    expect(arcCalls).toHaveLength(draft?.handles.length ?? 0);

    expect(
      calls.some((c) => {
        return c.op === "fillStyle" && c.args[0] === PALETTE.grip;
      }),
    ).toBe(true);
  });
});

describe("drawPlotScene: per-layer stroke widths (DOM stylesheet parity)", () => {
  // Each stroking layer must set its own width — before the width
  // constants existed, overlays/compare/drawings inherited whatever the
  // previous layer left behind, so their weight varied by scene kind.
  // The pinned values mirror the DOM stylesheets' stroke-widths
  // (SvgPathLayer/DrawingsLayer/IndicatorPane .module.css).
  it("overlays stroke at 1, the compare line at 1.5, regardless of scene kind", () => {
    const { ctx, calls } = recorderCtx();
    drawPlotScene(ctx, plotOf(compareScene, OVERLAYS), PALETTE, SIZE);

    const stroked = strokedWidths(calls);
    const overlayWidths = stroked
      .filter((s) => {
        return s.style === PALETTE.sma20 || s.style === PALETTE.ema50;
      })
      .map((s) => {
        return s.width;
      });
    expect(overlayWidths).toEqual([1, 1]);

    const compareStrokes = stroked.filter((s) => {
      return s.style === PALETTE.compare;
    });
    expect(compareStrokes).toEqual([{ style: PALETTE.compare, width: 1.5 }]);
  });

  it("drawings stroke at 1.5, a selected drawing at 2", () => {
    const selected: DrawingSceneItem = {
      id: "a",
      kind: "trendline",
      x1: 10,
      y1: 10,
      x2: 40,
      y2: 40,
      selected: true,
      handles: [{ x: 10, y: 10 }],
    };
    const unselected: DrawingSceneItem = {
      id: "b",
      kind: "hline",
      y: 60,
      selected: false,
      handles: [],
    };

    const { ctx, calls } = recorderCtx();
    drawPlotScene(
      ctx,
      plotOf(candleChartScene, [], [selected, unselected]),
      PALETTE,
      SIZE,
    );

    const stroked = strokedWidths(calls);
    expect(
      stroked.filter((s) => {
        return s.style === PALETTE.drawing;
      }),
    ).toEqual([{ style: PALETTE.drawing, width: 2 }]);
    expect(
      stroked.filter((s) => {
        return s.style === PALETTE.drawingLevel;
      }),
    ).toEqual([{ style: PALETTE.drawingLevel, width: 1.5 }]);
  });

  it("pane lines stroke at 1.25 over 1-wide guides", () => {
    const scene = paneScene("macd", pseudoRandomCloses(60), {
      start: 0,
      end: 60,
    });
    const { ctx, calls } = recorderCtx();
    drawPaneScene(ctx, scene, PALETTE, SIZE);

    const stroked = strokedWidths(calls);
    const guideWidths = stroked
      .filter((s) => {
        return s.style === PALETTE.paneGuide;
      })
      .map((s) => {
        return s.width;
      });
    expect(new Set(guideWidths)).toEqual(new Set([1]));

    const lineWidths = stroked
      .filter((s) => {
        return s.style === PALETTE.paneMacd || s.style === PALETTE.paneSignal;
      })
      .map((s) => {
        return s.width;
      });
    expect(lineWidths).toEqual([1.25, 1.25]);
  });
});

describe("drawPlotScene: crosshair", () => {
  it("strokes one vertical and one horizontal 1px line in palette.crosshair when present", () => {
    expect(crosshair).not.toBeNull();
    const { ctx, calls } = recorderCtx();
    drawPlotScene(
      ctx,
      plotOf(candleChartScene, [], [], crosshair),
      PALETTE,
      SIZE,
    );

    const crosshairStrokeIdx = calls.findIndex((c) => {
      return c.op === "strokeStyle" && c.args[0] === PALETTE.crosshair;
    });
    expect(crosshairStrokeIdx).toBeGreaterThanOrEqual(0);

    const strokesAfter = calls.slice(crosshairStrokeIdx).filter((c) => {
      return c.op === "stroke";
    }).length;
    expect(strokesAfter).toBe(2);
  });

  it("omits the crosshair lines when null", () => {
    const { ctx, calls } = recorderCtx();
    drawPlotScene(ctx, plotOf(candleChartScene, [], [], null), PALETTE, SIZE);
    expect(
      calls.some((c) => {
        return c.op === "strokeStyle" && c.args[0] === PALETTE.crosshair;
      }),
    ).toBe(false);
  });
});

describe("drawVolumeScene", () => {
  const bars = volumeScene(CANDLES, VIEWPORT);

  it("clears once, then draws one fillRect per bar rising from the bottom edge, colored by up/down", () => {
    expect(bars.length).toBeGreaterThan(0);
    const { ctx, calls } = recorderCtx();
    drawVolumeScene(ctx, bars, PALETTE, SIZE);

    expect(calls[0]).toEqual({ op: "clearRect", args: [0, 0, 100, 100] });

    const fillRects = calls.filter((c) => {
      return c.op === "fillRect";
    });
    expect(fillRects).toHaveLength(bars.length);

    const first = bars[0];
    expectNumericCall(fillRects[0], "fillRect", [
      first.x - first.w / 2,
      100 - first.h,
      first.w,
      first.h,
    ]);

    const fillStyles = calls
      .filter((c) => {
        return c.op === "fillStyle";
      })
      .map((c) => {
        return c.args[0];
      });
    expect(fillStyles).toEqual(
      bars.map((b) => {
        return b.up ? PALETTE.up : PALETTE.down;
      }),
    );
  });
});

describe("drawPaneScene: macd", () => {
  const scene = paneScene("macd", pseudoRandomCloses(60), {
    start: 0,
    end: 60,
  });

  it("strokes guides with palette.paneGuide, fills the histogram from the zero line, and strokes macd/signal by key", () => {
    expect(scene.histogram.length).toBeGreaterThan(0);

    const { ctx, calls } = recorderCtx();
    drawPaneScene(ctx, scene, PALETTE, SIZE);

    expect(calls[0]).toEqual({ op: "clearRect", args: [0, 0, 100, 100] });
    expect(
      calls.some((c) => {
        return c.op === "strokeStyle" && c.args[0] === PALETTE.paneGuide;
      }),
    ).toBe(true);

    const zeroY = scene.guides[0]?.y ?? 50;
    const histFillRects = calls.filter((c) => {
      return c.op === "fillRect";
    });
    expect(histFillRects).toHaveLength(scene.histogram.length);

    scene.histogram.forEach((bar, i) => {
      const expectedTop = bar.up ? zeroY - bar.h : zeroY;
      expectNumericCall(histFillRects[i], "fillRect", [
        bar.x - bar.w / 2,
        expectedTop,
        bar.w,
        bar.h,
      ]);
    });

    expect(
      calls.some((c) => {
        return c.op === "fillStyle" && c.args[0] === PALETTE.histogram;
      }),
    ).toBe(true);

    const strokeStyleValues = calls
      .filter((c) => {
        return c.op === "strokeStyle";
      })
      .map((c) => {
        return c.args[0];
      });
    expect(strokeStyleValues).toContain(PALETTE.paneMacd);
    expect(strokeStyleValues).toContain(PALETTE.paneSignal);
  });
});

describe("drawPaneScene: rsi", () => {
  const scene = paneScene("rsi", rampUp(30), { start: 0, end: 30 });

  it("strokes the rsi line with palette.paneRsi and has no histogram", () => {
    expect(scene.histogram).toEqual([]);
    const { ctx, calls } = recorderCtx();
    drawPaneScene(ctx, scene, PALETTE, SIZE);

    expect(
      calls.some((c) => {
        return c.op === "strokeStyle" && c.args[0] === PALETTE.paneRsi;
      }),
    ).toBe(true);
    expect(
      calls.some((c) => {
        return c.op === "fillRect";
      }),
    ).toBe(false);
  });
});

describe("drawPlotScene: empty scene", () => {
  it("clears once and draws nothing else", () => {
    const emptyScene = chartScene([], 0, false);
    const { ctx, calls } = recorderCtx();
    drawPlotScene(ctx, plotOf(emptyScene), PALETTE, SIZE);
    expect(calls).toEqual([{ op: "clearRect", args: [0, 0, 100, 100] }]);
  });
});

describe("CHART_PALETTE_TOKENS", () => {
  it("pins the verbatim token map", () => {
    expect(CHART_PALETTE_TOKENS).toEqual({
      up: "--accent-positive",
      down: "--accent-negative",
      grid: "--grid",
      line: "--accent-primary",
      sma20: "--accent-2",
      ema50: "--accent-aware",
      compare: "--accent-compare",
      drawing: "--accent-primary",
      drawingLevel: "--accent-aware",
      grip: "--accent-primary",
      crosshair: "--border-strong",
      paneRsi: "--accent-primary",
      paneMacd: "--accent-2",
      paneSignal: "--accent-aware",
      paneGuide: "--grid",
      histogram: "--text-muted",
    });
  });

  const REACT_CHART_DIR = fileURLToPath(
    new URL("../../client-react/src/ui/equities/chart/", import.meta.url),
  );

  const SOLID_CHART_DIR = fileURLToPath(
    new URL("../../client-solid/src/ui/equities/chart/", import.meta.url),
  );

  function readAllModuleCss(dir: string): string {
    return readdirSync(dir)
      .filter((f) => {
        return f.endsWith(".module.css");
      })
      .map((f) => {
        return readFileSync(`${dir}${f}`, "utf8");
      })
      .join("\n");
  }

  const reactCss = readAllModuleCss(REACT_CHART_DIR);
  const solidCss = readAllModuleCss(SOLID_CHART_DIR);

  for (const [key, token] of Object.entries(CHART_PALETTE_TOKENS)) {
    it(`${key} -> ${token} appears in both clients' chart *.module.css`, () => {
      expect(reactCss).toContain(token);
      expect(solidCss).toContain(token);
    });
  }
});

// A one-minute-bucket candle at series index `i`: open climbs by 1 per
// index, close alternates +/-1 (direction alternates candle-to-candle) —
// the same deterministic formula the clients' visual-tier chart hosts use
// (EquitiesChartInteractive.visual.tsx's candleAt), duplicated here (not
// imported) because that file lives in each client's test tree, not a
// package export.
function candleAt(i: number): ChartCandle {
  const open = 100 + i;
  const close = i % 2 === 0 ? open + 1 : open - 1;

  return {
    time: i * BUCKET_MS,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: 1_000_000 + i * 1_000,
  };
}

// A second series sharing every candle's `time`, offset +10 in price — a
// deterministic compare overlay that resolves against the whole window.
function compareCandleAt(i: number): ChartCandle {
  const base = candleAt(i);
  return {
    ...base,
    open: base.open + 10,
    high: base.high + 10,
    low: base.low + 10,
    close: base.close + 10,
  };
}

function plotOf(
  scene: ChartScene,
  overlays: readonly OverlayLine[] = [],
  drawings: readonly DrawingSceneItem[] = [],
  crosshairArg: CrosshairScene | null = null,
): PlotCanvasScene {
  return { scene, overlays, drawings, crosshair: crosshairArg };
}

interface RecordedCall {
  readonly op: string;
  readonly args: readonly unknown[];
}

interface RecorderCtx {
  readonly ctx: Canvas2D;
  readonly calls: RecordedCall[];
}

// Replays a recorded call list, tracking the strokeStyle/lineWidth in
// effect at each `stroke` op — the observable a width pin cares about,
// since a layer may set its width once ahead of several strokes.
function strokedWidths(
  calls: readonly RecordedCall[],
): readonly { style: unknown; width: unknown }[] {
  const out: { style: unknown; width: unknown }[] = [];
  let style: unknown = "";
  let width: unknown = 0;

  for (const c of calls) {
    if (c.op === "strokeStyle") {
      style = c.args[0];
    } else if (c.op === "lineWidth") {
      width = c.args[0];
    } else if (c.op === "stroke") {
      out.push({ style, width });
    }
  }

  return out;
}

// Fake Canvas2D: records every method call and property set instead of
// touching a real canvas, so the engine's exact call sequence can be
// pinned without a DOM/jsdom canvas backend (jsdom's canvas is
// unimplemented anyway). `createLinearGradient` returns a recording
// CanvasGradient2D so a fill pass's `addColorStop` calls are visible too.
function recorderCtx(): RecorderCtx {
  const calls: RecordedCall[] = [];
  let fillStyleVal: string | CanvasGradient2D = "";
  let strokeStyleVal = "";
  let lineWidthVal = 0;
  let globalAlphaVal = 1;
  let shadowBlurVal = 0;
  let shadowColorVal = "";

  const target: Record<string, unknown> = {
    set fillStyle(v: string | CanvasGradient2D) {
      fillStyleVal = v;
      calls.push({ op: "fillStyle", args: [v] });
    },
    get fillStyle(): string | CanvasGradient2D {
      return fillStyleVal;
    },
    set strokeStyle(v: string) {
      strokeStyleVal = v;
      calls.push({ op: "strokeStyle", args: [v] });
    },
    get strokeStyle(): string {
      return strokeStyleVal;
    },
    set lineWidth(v: number) {
      lineWidthVal = v;
      calls.push({ op: "lineWidth", args: [v] });
    },
    get lineWidth(): number {
      return lineWidthVal;
    },
    set globalAlpha(v: number) {
      globalAlphaVal = v;
      calls.push({ op: "globalAlpha", args: [v] });
    },
    get globalAlpha(): number {
      return globalAlphaVal;
    },
    set shadowBlur(v: number) {
      shadowBlurVal = v;
      calls.push({ op: "shadowBlur", args: [v] });
    },
    get shadowBlur(): number {
      return shadowBlurVal;
    },
    set shadowColor(v: string) {
      shadowColorVal = v;
      calls.push({ op: "shadowColor", args: [v] });
    },
    get shadowColor(): string {
      return shadowColorVal;
    },
  };

  for (const op of [
    "clearRect",
    "fillRect",
    "beginPath",
    "moveTo",
    "lineTo",
    "closePath",
    "arc",
    "stroke",
    "fill",
    "setLineDash",
  ]) {
    target[op] = (...args: unknown[]): void => {
      calls.push({ op, args });
    };
  }

  target.createLinearGradient = (...args: number[]): CanvasGradient2D => {
    calls.push({ op: "createLinearGradient", args });
    return {
      addColorStop(offset: number, color: string): void {
        calls.push({ op: "addColorStop", args: [offset, color] });
      },
    };
  };

  return { ctx: target as unknown as Canvas2D, calls };
}

/** Asserts a recorded call's op and numeric args within floating-point
 * tolerance: the expected values here are computed independently of the
 * engine's own `px()` round-trip (a division immediately undone by the
 * same multiplication), which can differ from the scene's raw percent by
 * a single ULP even at `size` 100 — an exact `toEqual` would be brittle to
 * that noise, not to a real geometry bug. */
function expectNumericCall(
  call: RecordedCall | undefined,
  op: string,
  args: readonly number[],
): void {
  expect(call?.op).toBe(op);
  expect(call?.args).toHaveLength(args.length);

  for (let i = 0; i < args.length; i++) {
    expect(call?.args[i]).toBeCloseTo(args[i], 9);
  }
}

/** Fixed LCG so the fixture is stable without Math.random — same recipe as
 * paneScene.test.ts's own pseudoRandomCloses, duplicated (not imported)
 * since it's a private test-only helper there. */
function pseudoRandomCloses(n: number): number[] {
  const out: number[] = [];
  let seed = 42;

  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    out.push(100 + (seed % 1000) / 100);
  }

  return out;
}

function rampUp(n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    return 100 + i;
  });
}
