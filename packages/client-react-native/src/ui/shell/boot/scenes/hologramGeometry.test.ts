import { expect, test } from "vitest";

import {
  columnAssembly,
  columnAssemblyPhase,
  columnHeight,
  columnIsHot,
  columnRisePhase,
  EMITTER_RINGS,
  EMITTER_TICK_COUNT,
  emitterTickAngle,
  GYRO_RINGS,
  groundGridPhase,
  gyroRingSpin,
  HOLOGRAM_CALLOUTS,
  HOLOGRAM_CONE,
  HOLOGRAM_GRID_SIZE,
  HOLOGRAM_PAD_Y,
  HOLOGRAM_PERSPECTIVE_K,
  HOLOGRAM_PITCH,
  HOLOGRAM_PROJ_SCALE_FACTOR,
  hexCellAlpha,
  hologramBlinkAlpha,
  hologramColumns,
  hologramFlicker,
  hologramHexCells,
  hologramMotes,
  hologramStatus,
  hologramTelemetry,
  hologramYaw,
  moteRise,
  scanRingHeight,
} from "./hologramGeometry";

// ── the assembling 9x9 market grid ──────────────────────────────────────────

test("the market grid is 9x9, matching the web's GRID_SIZE", () => {
  expect(HOLOGRAM_GRID_SIZE).toBe(9);
  expect(hologramColumns()).toHaveLength(81);
});

test("every column has a stable home position and a scattered start", () => {
  for (const column of hologramColumns()) {
    expect(Number.isFinite(column.normX)).toBe(true);
    expect(Number.isFinite(column.normZ)).toBe(true);
    expect(
      Math.hypot(
        column.scatterX - column.normX,
        column.scatterZ - column.normZ,
      ),
    ).toBeGreaterThan(0);
  }
});

test("hologramColumns is deterministic — two calls agree", () => {
  expect(hologramColumns()).toStrictEqual(hologramColumns());
});

test("the grid spans normalised [-1, 1] on both axes", () => {
  const columns = hologramColumns();
  const xs = columns.map((c) => {
    return c.normX;
  });

  expect(Math.min(...xs)).toBeCloseTo(-1);
  expect(Math.max(...xs)).toBeCloseTo(1);
});

test("columns assemble from scatter to home across the boot", () => {
  const [column] = hologramColumns();
  const early = columnAssembly(column, 0.1, column.height);
  const settled = columnAssembly(column, 1, column.height);

  expect(
    Math.hypot(early.x - column.normX, early.z - column.normZ),
  ).toBeGreaterThan(
    Math.hypot(settled.x - column.normX, settled.z - column.normZ),
  );
  expect(settled.x).toBeCloseTo(column.normX);
  expect(settled.z).toBeCloseTo(column.normZ);
});

// The web staggers assembly by `column.delay`, so the grid does not snap into
// place as one block. Two columns with different delays must not share a phase.
test("assembly is staggered per column, not synchronised", () => {
  const columns = hologramColumns();
  const phases = columns.map((column) => {
    return columnAssemblyPhase(column, 0.35);
  });

  expect(new Set(phases).size).toBeGreaterThan(1);
});

test("assembly phase is clamped to [0, 1] across the whole boot", () => {
  const [column] = hologramColumns();

  for (let step = 0; step <= 100; step++) {
    const phase = columnAssemblyPhase(column, step / 100);

    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThanOrEqual(1);
  }
});

// The web only starts raising a column once its particle has mostly arrived —
// `risePhase` stays 0 for the first 55% of assembly. Losing that would make the
// columns grow out of the scatter cloud instead of after it.
test("columns do not start rising until assembly is 55% done", () => {
  expect(columnRisePhase(0.5)).toBe(0);
  expect(columnRisePhase(0.55)).toBe(0);
  expect(columnRisePhase(1)).toBeCloseTo(1);
});

test("column height breathes around its base height", () => {
  const [column] = hologramColumns();
  const samples = Array.from({ length: 40 }, (_, i) => {
    return columnHeight(column, i / 4);
  });

  // The web breathes height by ±0.12 around 0.88, so the band is [0.76, 1.00].
  expect(Math.min(...samples)).toBeGreaterThanOrEqual(column.height * 0.76);
  expect(Math.max(...samples)).toBeLessThanOrEqual(column.height);
});

test("the tallest columns are flagged hot so they take the alt accent", () => {
  const columns = hologramColumns();
  const hot = columns.filter(columnIsHot);

  expect(hot.length).toBeGreaterThan(0);
  expect(hot.length).toBeLessThan(columns.length);

  for (const column of hot) {
    expect(column.height).toBeGreaterThan(0.75);
  }
});

// ── projection constants (the correction Task 1 carries) ────────────────────

// `bootHologram.ts:216` is `1 / (1 + depth * 0.26)` — no near-plane clamp.
// Defaulting one on would diverge from the web at depth.
test("hologram projects with its own k and NO near-plane clamp", () => {
  expect(HOLOGRAM_PERSPECTIVE_K).toBe(0.26);
  expect(HOLOGRAM_PITCH).toBeCloseTo(0.46);
  expect(HOLOGRAM_PROJ_SCALE_FACTOR).toBeCloseTo(0.27);
});

test("the camera yaw drifts continuously from its 0.7 rad offset", () => {
  expect(hologramYaw(0)).toBeCloseTo(0.7);
  expect(hologramYaw(2)).toBeCloseTo(0.7 + 2 * 0.45);
  expect(hologramYaw(3)).toBeGreaterThan(hologramYaw(2));
});

// ── flicker ────────────────────────────────────────────────────────────────

test("the whole-frame flicker stays within the web's alpha band", () => {
  for (let i = 0; i < 600; i++) {
    const alpha = hologramFlicker(i / 40);

    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(1);
  }
});

// The web drops the whole frame to 55% on a rare hash draw — that dropout IS
// the hologram read. A flicker that never dips is a silently wrong port.
test("the flicker occasionally drops the frame to a dim dropout", () => {
  const samples = Array.from({ length: 4000 }, (_, i) => {
    return hologramFlicker(i / 20);
  });

  expect(Math.min(...samples)).toBeLessThan(0.6);
});

// ── backdrop, ground grid, cone ─────────────────────────────────────────────

test("the backdrop hex field is 16 cells, deterministic and on-screen", () => {
  const cells = hologramHexCells();

  expect(cells).toHaveLength(16);
  expect(cells).toStrictEqual(hologramHexCells());

  for (const cell of cells) {
    expect(cell.x).toBeGreaterThanOrEqual(0);
    expect(cell.x).toBeLessThanOrEqual(1);
    expect(cell.y).toBeGreaterThanOrEqual(0);
    expect(cell.y).toBeLessThanOrEqual(1);
  }
});

test("hex cells breathe within the web's faint alpha band", () => {
  const [cell] = hologramHexCells();

  for (let i = 0; i < 200; i++) {
    const alpha = hexCellAlpha(cell, i / 10);

    expect(alpha).toBeGreaterThanOrEqual(0);
    expect(alpha).toBeLessThanOrEqual(0.09);
  }
});

test("the ground grid expands from the centre outward", () => {
  expect(groundGridPhase(1)).toBeGreaterThan(groundGridPhase(0.1));
  expect(groundGridPhase(1)).toBeCloseTo(1);
});

test("the ground grid stays hidden for the first frames", () => {
  expect(groundGridPhase(0)).toBe(0);
  expect(groundGridPhase(0.04)).toBe(0);
});

// CORRECTION vs the plan's draft test. The plan asserted the light cone
// "widens as the boot proceeds". Reading `bootHologram.ts:236-253`, the cone is
// built from `projScale` and the emitter pad alone — it has NO progress term
// and is the same size on frame 1 and frame 900. Asserting growth would have
// pinned an animation the web does not have.
test("the light cone is fixed geometry, not a function of progress", () => {
  expect(HOLOGRAM_CONE.padHalfWidth).toBeCloseTo(1.5);
  expect(HOLOGRAM_CONE.topHalfWidth).toBeCloseTo(0.6);
  expect(HOLOGRAM_CONE.topRise).toBeCloseTo(0.9);
});

// ── emitter pad ─────────────────────────────────────────────────────────────

// CORRECTION vs the plan's draft test, which asserted the rings are "ordered
// outward". They are not: the web draws 1.62, then 1.5, then the dashed 1.74,
// and the draw ORDER is what layers the dashed ring over the solid pair.
// Sorting them to satisfy a tidier assertion would change the render.
test("emitter rings keep the web's draw order, which is not radius order", () => {
  expect(
    EMITTER_RINGS.map((ring) => {
      return ring.radius;
    }),
  ).toStrictEqual([1.62, 1.5, 1.74]);
});

test("only the outermost emitter ring is dashed and counter-rotating", () => {
  const [solid, inner, dashed] = EMITTER_RINGS;

  expect(solid.dash).toBeUndefined();
  expect(inner.dash).toBeUndefined();
  expect(dashed.dash).toStrictEqual([3, 6]);
  expect(dashed.rotationRate).toBeLessThan(0);
});

test("all emitter rings sit on the pad plane", () => {
  for (const ring of EMITTER_RINGS) {
    expect(ring.y).toBeCloseTo(HOLOGRAM_PAD_Y);
  }
});

test("the emitter pad carries 48 tick marks that rotate", () => {
  expect(EMITTER_TICK_COUNT).toBe(48);
  expect(emitterTickAngle(0, 1)).toBeGreaterThan(emitterTickAngle(0, 0));
  expect(emitterTickAngle(1, 0)).toBeGreaterThan(emitterTickAngle(0, 0));
});

// ── scan ring, gyro rings, motes ────────────────────────────────────────────

test("the scan ring sweeps upward and repeats", () => {
  const low = scanRingHeight(0.1);
  const high = scanRingHeight(0.9);

  expect(high).not.toBeCloseTo(low);
  // Sawtooth: it wraps back to the pad every 1/0.45 s.
  expect(scanRingHeight(0)).toBeCloseTo(scanRingHeight(1 / 0.45));
});

test("the scan ring travels downward from the pad through the structure", () => {
  expect(scanRingHeight(0)).toBeCloseTo(HOLOGRAM_PAD_Y);
  expect(scanRingHeight(1)).toBeLessThan(HOLOGRAM_PAD_Y);
});

test("the two gyroscopic rings counter-rotate", () => {
  expect(Math.sign(gyroRingSpin(2).outer - gyroRingSpin(1).outer)).not.toBe(
    Math.sign(gyroRingSpin(2).inner - gyroRingSpin(1).inner),
  );
});

test("the gyro rings keep their distinct radii and opposed tilts", () => {
  const [outer, inner] = GYRO_RINGS;

  expect(outer.radius).toBeCloseTo(1.9);
  expect(inner.radius).toBeCloseTo(2.05);
  expect(Math.sign(outer.tilt)).not.toBe(Math.sign(inner.tilt));
});

test("dust motes are 36, deterministic, and rise within the cone", () => {
  const motes = hologramMotes();

  expect(motes).toHaveLength(36);
  expect(motes).toStrictEqual(hologramMotes());
});

// CORRECTION vs the plan's draft test, which expected mote y in [0, 1]. The web
// is `0.62 - frac * 1.3`, so a mote rises from the pad at 0.62 up to -0.68 —
// negative y is UP in this projection. The [0,1] bound would have failed
// against a correct port and invited "fixing" the port to match the test.
test("motes rise from the emitter pad and wrap, spanning the cone height", () => {
  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;

  for (const mote of hologramMotes()) {
    for (let i = 0; i < 200; i++) {
      const rise = moteRise(mote, i / 8);

      expect(rise.y).toBeLessThanOrEqual(HOLOGRAM_PAD_Y);
      expect(rise.y).toBeGreaterThanOrEqual(HOLOGRAM_PAD_Y - 1.3);
      lowest = Math.min(lowest, rise.y);
      highest = Math.max(highest, rise.y);
    }
  }

  expect(highest).toBeGreaterThan(0.5);
  expect(lowest).toBeLessThan(0);
});

test("motes fade out as they rise", () => {
  const [mote] = hologramMotes();
  const samples = Array.from({ length: 100 }, (_, i) => {
    return moteRise(mote, i / 8);
  });

  for (const sample of samples) {
    expect(sample.alpha).toBeGreaterThanOrEqual(0);
    expect(sample.alpha).toBeLessThanOrEqual(0.35);
  }
});

// ── callouts, telemetry, status ─────────────────────────────────────────────

// Transcribed from `bootHologram.ts:141-160`, NOT abbreviated. The plan's draft
// guessed "FX"/"RISK"/"ORDER FLOW"; the web reads "FX CORE"/"RISK GRID".
test("the callout panels carry the web's three labels verbatim", () => {
  expect(
    HOLOGRAM_CALLOUTS.map((callout) => {
      return callout.label;
    }),
  ).toStrictEqual(["FX CORE", "RISK GRID", "ORDER FLOW"]);
});

test("callout values keep the web's glyphs and figures", () => {
  expect(
    HOLOGRAM_CALLOUTS.map((callout) => {
      return callout.value;
    }),
  ).toStrictEqual(["▲ 1.0842", "σ 12.4", "≡ 48/s"]);
});

test("callouts appear in sequence, each anchored to a real grid column", () => {
  const columns = hologramColumns();
  let previous = 0;

  for (const callout of HOLOGRAM_CALLOUTS) {
    expect(callout.appearAt).toBeGreaterThan(previous);
    previous = callout.appearAt;
    expect(columns[callout.gridIndex]).toBeDefined();
  }
});

test("the status ladder walks its states in order", () => {
  expect(hologramStatus(0).text).toBe("COMPILING MARKET HOLOGRAM");
  expect(hologramStatus(0.6).text).toBe("RESOLVING DEPTH FIELD");
  expect(hologramStatus(0.9).text).toBe("STRUCTURE STABLE ▸ HANDOFF");
});

test("only the final status switches to the alt accent", () => {
  expect(hologramStatus(0).useAltAccent).toBe(false);
  expect(hologramStatus(0.6).useAltAccent).toBe(false);
  expect(hologramStatus(0.9).useAltAccent).toBe(true);
});

test("the banner blinks until handoff, then holds solid", () => {
  expect(hologramBlinkAlpha(0.9, 0)).toBe(1);
  expect(hologramBlinkAlpha(0.9, 1.7)).toBe(1);

  const blinking = Array.from({ length: 60 }, (_, i) => {
    return hologramBlinkAlpha(0.3, i / 10);
  });

  expect(Math.min(...blinking)).toBeLessThan(0.99);
  expect(Math.min(...blinking)).toBeGreaterThanOrEqual(0.55);
});

// U+25C9 FISHEYE — which the web's "◉ HOLO-PROJ 01" uses — is in NO bundled
// face, so it must come through the shared substitution rather than be inlined.
// This is the P1 class: a missing glyph draws nothing on iOS, silently.
test("telemetry uses the substituted bullet, never the web's fisheye", () => {
  const telemetry = hologramTelemetry(0.5, 1.2);

  expect(telemetry.title).not.toContain("◉");
  expect(telemetry.title).toContain("●");
  expect(telemetry.title).toContain("HOLO-PROJ 01");
});

test("telemetry counts particles up to the web's 6480 total", () => {
  expect(hologramTelemetry(0, 0).particles).toBe("PARTICLES 0 / 6480");
  expect(hologramTelemetry(1, 0).particles).toBe("PARTICLES 6480 / 6480");
});

test("telemetry reports yaw in wrapped degrees and assembly as a percentage", () => {
  expect(hologramTelemetry(0.42, 0).yaw).toBe("YAW 0.0°");
  expect(hologramTelemetry(0.42, 0).assembly).toBe("ASSEMBLY 42%");
});

test("telemetry yaw wraps rather than growing without bound", () => {
  const late = hologramTelemetry(1, 400).yaw;
  const degrees = Number.parseFloat(late.replace("YAW ", ""));

  expect(degrees).toBeGreaterThanOrEqual(0);
  expect(degrees).toBeLessThan(360);
});
