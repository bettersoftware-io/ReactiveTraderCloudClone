import { expect, test } from "vitest";

import {
  arcRingStart,
  GHOST_FRAME_MIN_SPREAD,
  LAYER_PANELS,
  LAYERS_ARC_RINGS,
  LAYERS_MIN_PERSPECTIVE_DENOM,
  LAYERS_PERSPECTIVE_K,
  LAYERS_PULL_DEPTH,
  layersBlinkAlpha,
  layersFlicker,
  layersPitch,
  layersSpread,
  layersStatus,
  layersTelemetry,
  layersYaw,
  PULL_STEP_SEC,
  PULLABLE_PANELS,
  panelAlpha,
  panelDepthReadout,
  panelDrawPhase,
  panelWorldRect,
  pullActive,
  pullAmount,
  pulledPanelIndex,
  pullScanV,
} from "./layersGeometry";

// ── the panel table ─────────────────────────────────────────────────────────

test("there are 7 z-separated layers", () => {
  expect(LAYER_PANELS).toHaveLength(7);
});

test("every panel has a normalised rect and a distinct z", () => {
  const zs = new Set<number>();

  for (const panel of LAYER_PANELS) {
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.w).toBeLessThanOrEqual(1);
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.y + panel.h).toBeLessThanOrEqual(1);
    zs.add(panel.z);
  }

  expect(zs.size).toBe(LAYER_PANELS.length);
});

test("panels are ordered back to front, as the draw stagger assumes", () => {
  for (let i = 1; i < LAYER_PANELS.length; i++) {
    expect(LAYER_PANELS[i].z).toBeLessThan(LAYER_PANELS[i - 1].z);
  }
});

test("the backdrop is the only layer the inspection cycle never pulls", () => {
  expect(PULLABLE_PANELS).toHaveLength(6);
  expect(
    LAYER_PANELS.filter((panel) => {
      return !panel.pull;
    }).map((panel) => {
      return panel.kind;
    }),
  ).toStrictEqual(["bg"]);
});

test("layer labels carry the web's L0n prefixes verbatim", () => {
  expect(
    LAYER_PANELS.map((panel) => {
      return panel.label;
    }),
  ).toStrictEqual([
    "L06 · BACKDROP GRID",
    "L05 · SYSTEM BUS",
    "L04 · TRADE BLOTTER",
    "L03 · FX PRICING GRID",
    "L02 · WATCHLIST",
    "L02 · RFQ INBOX",
    "L01 · COMMAND BAR",
  ]);
});

// ── the spread envelope (the spine) ─────────────────────────────────────────

// CORRECTION vs the plan's draft, which expected `layersPhase(p).name` to
// return "draw-in"/"explode"/"orbit"/"recomposite". The source has NO phase
// enum: the schedule is one continuous envelope, and every spatial term scales
// by it. Quantising it into four states would have replaced a smooth animation
// with a stepped one.
test("the stack lies flat at both ends of the boot and separates in between", () => {
  expect(layersSpread(0)).toBeCloseTo(0);
  expect(layersSpread(0.14)).toBeCloseTo(0);
  expect(layersSpread(0.5)).toBeGreaterThan(0.9);
  expect(layersSpread(1)).toBeCloseTo(0);
});

test("the spread envelope rises then falls, never exceeding 1", () => {
  let peak = 0;

  for (let step = 0; step <= 200; step++) {
    const spread = layersSpread(step / 200);

    expect(spread).toBeGreaterThanOrEqual(0);
    expect(spread).toBeLessThanOrEqual(1);
    peak = Math.max(peak, spread);
  }

  expect(peak).toBeCloseTo(1, 1);
});

test("panels are flat when spread is zero and z-separated at full spread", () => {
  const panel = LAYER_PANELS[4];

  expect(panelWorldRect(panel, 0, 0).z).toBeCloseTo(0);
  expect(Math.abs(panelWorldRect(panel, 1, 0).z)).toBeGreaterThan(0);
});

test("a pulled panel travels toward the camera, on top of its explode z", () => {
  const panel = LAYER_PANELS[3];
  const resting = panelWorldRect(panel, 1, 0).z;
  const pulled = panelWorldRect(panel, 1, 1).z;

  expect(pulled).toBeCloseTo(resting + LAYERS_PULL_DEPTH);
  expect(pulled).toBeLessThan(resting);
});

test("the world rect maps the normalised rect about the origin", () => {
  const rect = panelWorldRect(LAYER_PANELS[0], 0, 0);

  expect(rect.x0).toBeCloseTo((0.02 - 0.5) * 2.6);
  expect(rect.width).toBeCloseTo(0.96 * 2.6);
});

// ── camera ──────────────────────────────────────────────────────────────────

// `bootLayers.ts:202` is `1 / Math.max(0.4, 1 + z2 * 0.24)` — clamped, unlike
// `hologram`'s unclamped 0.26. This pair is why the camera parameterises both.
test("layers projects with a clamped near plane, unlike hologram", () => {
  expect(LAYERS_PERSPECTIVE_K).toBe(0.24);
  expect(LAYERS_MIN_PERSPECTIVE_DENOM).toBe(0.4);
});

// Yaw and pitch are MULTIPLIED by spread, which is what keeps the stack
// perfectly flat-on at the start and end rather than merely un-separated.
test("the camera is square-on whenever the stack is flat", () => {
  expect(layersYaw(3, 1, 0)).toBe(0);
  expect(layersPitch(1, 0)).toBe(0);
});

test("drift swings the camera only while the stack is separated", () => {
  expect(layersYaw(0, 1, 1)).toBeGreaterThan(layersYaw(0, -1, 1));
  expect(layersPitch(1, 1)).toBeGreaterThan(layersPitch(-1, 1));
});

// ── the inspection cycle ────────────────────────────────────────────────────

test("the inspection cycle runs only in the middle of the boot", () => {
  expect(pullActive(0.2)).toBe(false);
  expect(pullActive(0.5)).toBe(true);
  expect(pullActive(0.95)).toBe(false);
});

// CORRECTION vs the plan's draft `pulledPanelIndex(progress)`. The web advances
// this on a wall-clock 1.05 s step, independent of the boot's progress curve.
test("only pullable panels are ever selected, and selection advances", () => {
  const seen = new Set<number>();

  for (let step = 0; step <= 120; step++) {
    const index = pulledPanelIndex(step / 4);

    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(PULLABLE_PANELS.length);
    expect(PULLABLE_PANELS[index].pull).toBe(true);
    seen.add(index);
  }

  expect(seen.size).toBe(PULLABLE_PANELS.length);
});

test("the cycle steps once per PULL_STEP_SEC and wraps", () => {
  const base = 4.2 * 0.38 + 0.01;

  expect(pulledPanelIndex(base)).toBe(0);
  expect(pulledPanelIndex(base + PULL_STEP_SEC)).toBe(1);
  expect(pulledPanelIndex(base + PULL_STEP_SEC * PULLABLE_PANELS.length)).toBe(
    0,
  );
});

test("pull amount is a smooth out-and-back, zero outside the window", () => {
  expect(pullAmount(2, 0.2)).toBe(0);
  expect(pullAmount(2, 0.95)).toBe(0);

  let peak = 0;

  for (let step = 0; step <= 100; step++) {
    const amount = pullAmount(2 + step / 50, 0.5);

    expect(amount).toBeGreaterThanOrEqual(0);
    expect(amount).toBeLessThanOrEqual(1);
    peak = Math.max(peak, amount);
  }

  expect(peak).toBeGreaterThan(0.9);
});

test("the scan sweep wraps across the inspected panel", () => {
  expect(pullScanV(0)).toBeCloseTo(0);
  expect(pullScanV(1 / 1.4)).toBeCloseTo(0);
  expect(pullScanV(0.5 / 1.4)).toBeCloseTo(0.5);
});

// ── draw-in stagger and alpha ───────────────────────────────────────────────

test("panels draw in staggered by index, not all at once", () => {
  expect(panelDrawPhase(0, 0.05)).toBeGreaterThan(panelDrawPhase(6, 0.05));
});

test("draw phase is clamped and complete well before the explode", () => {
  expect(panelDrawPhase(0, 0)).toBe(0);
  expect(panelDrawPhase(6, 0.3)).toBe(1);
});

test("nearer panels read stronger, and the pulled one lifts above the rest", () => {
  const near = panelAlpha(-0.5, 1, false);
  const far = panelAlpha(0.6, 1, false);

  expect(near).toBeGreaterThan(far);
  expect(panelAlpha(0, 1, true)).toBeGreaterThan(panelAlpha(0, 1, false));
});

// ── backdrop, flicker, arcs ─────────────────────────────────────────────────

test("the whole-frame flicker stays within the web's alpha band", () => {
  for (let i = 0; i < 600; i++) {
    const alpha = layersFlicker(i / 40);

    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(1);
  }
});

test("the flicker occasionally drops the frame to a dim dropout", () => {
  const samples = Array.from({ length: 4000 }, (_, i) => {
    return layersFlicker(i / 20);
  });

  expect(Math.min(...samples)).toBeLessThan(0.6);
});

test("the two arc rings counter-drift at different radii", () => {
  const [outer, inner] = LAYERS_ARC_RINGS;

  expect(inner.radiusFactor).toBeGreaterThan(outer.radiusFactor);
  expect(Math.sign(outer.spinRate)).not.toBe(Math.sign(inner.spinRate));
  expect(arcRingStart(outer, 2)).toBeGreaterThan(arcRingStart(outer, 1));
  expect(arcRingStart(inner, 2)).toBeLessThan(arcRingStart(inner, 1));
});

test("ghost frames appear only once the stack has begun to separate", () => {
  expect(layersSpread(0.14)).toBeLessThan(GHOST_FRAME_MIN_SPREAD);
  expect(layersSpread(0.5)).toBeGreaterThan(GHOST_FRAME_MIN_SPREAD);
});

// ── telemetry, status ───────────────────────────────────────────────────────

test("telemetry uses the substituted bullet, never the web's fisheye", () => {
  const telemetry = layersTelemetry(0.5, 0.3, 0.1);

  expect(telemetry.title).not.toContain("◉");
  expect(telemetry.title).toContain("●");
  expect(telemetry.title).toContain("UI COMPOSITOR");
});

test("telemetry reports the spread as a percentage and the orientation in degrees", () => {
  expect(layersTelemetry(0.5, 0, 0).layers).toBe("LAYERS 07 · Z-SPREAD 50%");
  expect(layersTelemetry(0, 0, 0).orientation).toBe("YAW 0.0°  PITCH 0.0°");
});

test("the status ladder walks its four states in order", () => {
  expect(layersStatus(0.05, 0).text).toBe("COMPILING INTERFACE");
  expect(layersStatus(0.2, 0).text).toBe("DECOMPOSING LAYERS");
  expect(layersStatus(0.5, 2).text).toContain("LAYER INSPECTION");
  expect(layersStatus(0.95, 0).text).toBe("RECOMPOSITING ▸ LAUNCH");
});

// The inspection state names the layer being inspected, with the "L0n · "
// prefix stripped — so the banner tracks the cycle rather than sitting static.
test("the inspection banner names the layer currently pulled", () => {
  const early = layersStatus(0.5, 2).text;
  const later = layersStatus(0.5, 2 + 1.05 * 2).text;

  expect(early).not.toBe(later);
  expect(early).not.toContain("·");
});

// The final state takes the POSITIVE accent — a third colour, which a two-way
// useAltAccent flag (as the other scenes use) could not express.
test("the status tone reaches a third colour at launch", () => {
  expect(layersStatus(0.05, 0).tone).toBe("accent");
  expect(layersStatus(0.5, 2).tone).toBe("accentAlt");
  expect(layersStatus(0.95, 0).tone).toBe("positive");
});

test("the banner blinks only while compiling, then holds solid", () => {
  expect(layersBlinkAlpha(0.5, 0.3)).toBe(1);

  const blinking = Array.from({ length: 60 }, (_, i) => {
    return layersBlinkAlpha(0.05, i / 10);
  });

  expect(Math.min(...blinking)).toBeLessThan(0.99);
  expect(Math.min(...blinking)).toBeGreaterThanOrEqual(0.55);
});

test("the depth readout renders world z as a whole-number percentage", () => {
  expect(panelDepthReadout(-0.85)).toBe("Z -85  ·  COMPOSITE OK");
});
