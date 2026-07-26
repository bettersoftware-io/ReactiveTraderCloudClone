import { expect, test } from "vitest";

import {
  beaconPhase,
  contourPhase,
  moteDrift,
  peakPriceText,
  peakTick,
  routePhase,
  TOPO_GRID_COLS,
  TOPO_GRID_ROWS,
  TOPO_LEVELS,
  TOPO_MIN_PERSPECTIVE_DENOM,
  TOPO_PEAKS,
  TOPO_PERSPECTIVE_K,
  topoBlinkAlpha,
  topoContours,
  topoFlicker,
  topoHeightAt,
  topoHeightfield,
  topoMeshLines,
  topoMotes,
  topoPitch,
  topoRise,
  topoStatus,
  topoTelemetry,
  topoTimestamp,
  topoYaw,
} from "./topoGeometry";

const HEIGHTS = topoHeightfield();

// ── the heightfield (the performance-critical table) ────────────────────────

// 52x36 = 1872 samples, each summing six gaussians. This does not prove the
// scene memoises it — nothing in jest can — but it pins the shape and
// determinism the memo depends on.
test("the heightfield is a stable 52x36 grid", () => {
  expect(HEIGHTS).toHaveLength(TOPO_GRID_COLS);
  expect(HEIGHTS[0]).toHaveLength(TOPO_GRID_ROWS);
  expect(topoHeightfield()).toStrictEqual(HEIGHTS);
});

test("the terrain is never negative and falls to zero at the table rim", () => {
  for (const column of HEIGHTS) {
    for (const height of column) {
      expect(height).toBeGreaterThanOrEqual(0);
    }
  }

  // The falloff reaches exactly zero at |x| = 1.32, which is just OUTSIDE the
  // grid's own -1.3..1.3 extent — so the rim is very low but not flat zero.
  expect(topoHeightAt(-1.3, 0)).toBeLessThan(0.01);
  expect(topoHeightAt(1.3, 0)).toBeLessThan(0.01);
  expect(topoHeightAt(-1.4, 0)).toBe(0);
});

// If a peak's gaussian were transposed the surface would still look like
// terrain, but the summit would not sit under its own pair's marker.
test("each peak raises the terrain at its own coordinates", () => {
  for (const peak of TOPO_PEAKS) {
    const atPeak = topoHeightAt(peak.x, peak.z);
    const offPeak = topoHeightAt(peak.x + 0.45, peak.z + 0.45);

    expect(atPeak).toBeGreaterThan(offPeak);
  }
});

test("the tallest terrain sits under the tallest peak", () => {
  const tallest = TOPO_PEAKS[0];

  for (const peak of TOPO_PEAKS) {
    expect(peak.height).toBeLessThanOrEqual(tallest.height);
  }

  expect(topoHeightAt(tallest.x, tallest.z)).toBeGreaterThan(0.5);
});

// ── contours ────────────────────────────────────────────────────────────────

test("there are eleven iso levels, evenly spaced and ascending", () => {
  expect(TOPO_LEVELS).toHaveLength(11);

  for (let i = 1; i < TOPO_LEVELS.length; i++) {
    expect(TOPO_LEVELS[i]).toBeCloseTo(TOPO_LEVELS[i - 1] + 0.052);
  }
});

test("contours close over the heightfield, each carrying whole segments", () => {
  const contours = topoContours(HEIGHTS);

  expect(contours).toHaveLength(11);

  for (const contour of contours) {
    // Flat [x0, z0, x1, z1, …] — always a whole number of segments.
    expect(contour.segments.length % 4).toBe(0);

    for (const value of contour.segments) {
      expect(Number.isFinite(value)).toBe(true);
    }
  }
});

// Higher iso levels cut smaller rings near the summits, so they carry fewer
// segments than the low ones that wrap the whole terrain.
test("higher contour levels enclose less ground than lower ones", () => {
  const contours = topoContours(HEIGHTS);

  expect(contours[0].segments.length).toBeGreaterThan(0);
  expect(contours[9].segments.length).toBeGreaterThan(0);
  expect(contours[9].segments.length).toBeLessThan(contours[0].segments.length);
});

// The measured terrain peaks at 0.5712 and the eleventh level sits at 0.575,
// so the web's TOP contour never draws anything. That is faithful behaviour,
// not a bug — pinned because respacing the levels to "use" it would change the
// render, and because an empty segment list must not be mistaken for a broken
// marching-squares pass.
test("the top iso level sits above the terrain and draws nothing", () => {
  const contours = topoContours(HEIGHTS);

  expect(TOPO_LEVELS[10]).toBeGreaterThan(0.5712);
  expect(contours[10].segments).toHaveLength(0);
});

test("contours are deterministic across rebuilds", () => {
  expect(topoContours(HEIGHTS)).toStrictEqual(topoContours(HEIGHTS));
});

test("contours reveal bottom-up, low levels before high", () => {
  expect(contourPhase(0, 0.2)).toBeGreaterThan(contourPhase(10, 0.2));
  expect(contourPhase(0, 0.06)).toBe(0);
});

// ── mesh, motes ─────────────────────────────────────────────────────────────

test("the sparse mesh samples rows and columns, never the whole grid", () => {
  const lines = topoMeshLines(HEIGHTS);

  expect(lines.length).toBeGreaterThan(0);

  for (const line of lines) {
    expect(line.length).toBeGreaterThan(1);
    expect(line.length).toBeLessThan(TOPO_GRID_COLS);
  }
});

test("there are 26 survey motes, deterministic and anchored near peaks", () => {
  const motes = topoMotes();

  expect(motes).toHaveLength(26);
  expect(topoMotes()).toStrictEqual(motes);

  for (const mote of motes) {
    const nearest = Math.min(
      ...TOPO_PEAKS.map((peak) => {
        return Math.hypot(mote.x - peak.x, mote.z - peak.z);
      }),
    );

    expect(nearest).toBeLessThan(0.4);
  }
});

test("motes drift and wrap within [0, 1)", () => {
  const [mote] = topoMotes();

  for (let step = 0; step < 300; step++) {
    const drift = moteDrift(mote, step / 4);

    expect(drift).toBeGreaterThanOrEqual(0);
    expect(drift).toBeLessThan(1);
  }
});

// ── camera ──────────────────────────────────────────────────────────────────

// `bootTopo.ts:381` is `1 / Math.max(0.4, 1 + z2 * 0.26)` — clamped.
test("topo projects with a clamped near plane", () => {
  expect(TOPO_PERSPECTIVE_K).toBe(0.26);
  expect(TOPO_MIN_PERSPECTIVE_DENOM).toBe(0.4);
});

test("the camera orbits steadily and responds to drift", () => {
  expect(topoYaw(0, 0)).toBeCloseTo(0.5);
  expect(topoYaw(2, 0)).toBeGreaterThan(topoYaw(1, 0));
  expect(topoPitch(0, 1)).toBeGreaterThan(topoPitch(0, -1));
});

test("the terrain rises over the first 40% of the boot", () => {
  expect(topoRise(0)).toBe(0);
  expect(topoRise(0.4)).toBeCloseTo(1);
  expect(topoRise(1)).toBeCloseTo(1);
});

// ── beacons, route ──────────────────────────────────────────────────────────

test("peaks reveal in sequence, tallest first", () => {
  for (let i = 1; i < TOPO_PEAKS.length; i++) {
    expect(TOPO_PEAKS[i].revealAt).toBeGreaterThan(TOPO_PEAKS[i - 1].revealAt);
    expect(TOPO_PEAKS[i].height).toBeLessThan(TOPO_PEAKS[i - 1].height);
  }
});

test("no beacon shows before its own reveal point", () => {
  for (const peak of TOPO_PEAKS) {
    expect(beaconPhase(peak, peak.revealAt)).toBe(0);
    expect(beaconPhase(peak, peak.revealAt + 0.2)).toBe(1);
  }
});

test("the route links the summits only once most have appeared", () => {
  expect(routePhase(0.62)).toBe(0);
  expect(routePhase(0.8)).toBe(1);
});

test("the six pairs are the web's, in order", () => {
  expect(
    TOPO_PEAKS.map((peak) => {
      return peak.pair;
    }),
  ).toStrictEqual([
    "EUR/USD",
    "GBP/USD",
    "USD/JPY",
    "AUD/USD",
    "EUR/GBP",
    "USD/CHF",
  ]);
});

// ── price ticks: the stateless reconstruction ───────────────────────────────

test("a price tick is deterministic — the same instant replays identically", () => {
  expect(peakTick(TOPO_PEAKS[0], 2.4)).toStrictEqual(
    peakTick(TOPO_PEAKS[0], 2.4),
  );
});

test("prices stay within the web's band around their base", () => {
  for (const peak of TOPO_PEAKS) {
    for (let step = 0; step < 200; step++) {
      const tick = peakTick(peak, step / 8);
      const drift = Math.abs(tick.value - peak.base);

      expect(drift).toBeLessThanOrEqual(peak.step * 7);
    }
  }
});

test("prices actually change over time rather than sitting at base", () => {
  const values = new Set(
    Array.from({ length: 60 }, (_, i) => {
      return peakTick(TOPO_PEAKS[0], i * 0.31).value;
    }),
  );

  expect(values.size).toBeGreaterThan(5);
});

// The flash is what makes a tick read as a tick. Decaying from the exact
// crossing rather than the frame that noticed it is what makes it reproducible
// for a pinned golden.
test("each tick flashes and the flash decays to nothing", () => {
  let sawBright = 0;
  let sawDark = 0;

  for (let step = 0; step < 400; step++) {
    const flash = peakTick(TOPO_PEAKS[0], step / 40).flash;

    expect(flash).toBeGreaterThanOrEqual(0);
    expect(flash).toBeLessThanOrEqual(1);

    if (flash > 0.8) {
      sawBright++;
    }

    if (flash === 0) {
      sawDark++;
    }
  }

  expect(sawBright).toBeGreaterThan(0);
  expect(sawDark).toBeGreaterThan(0);
});

test("direction reflects whether this tick beat the last one", () => {
  let sawRising = false;
  let sawFalling = false;

  for (let step = 0; step < 200; step++) {
    if (peakTick(TOPO_PEAKS[0], step * 0.31).rising) {
      sawRising = true;
    } else {
      sawFalling = true;
    }
  }

  expect(sawRising).toBe(true);
  expect(sawFalling).toBe(true);
});

test("each pair formats its price to its own precision", () => {
  expect(peakPriceText(TOPO_PEAKS[0], 1.09173)).toBe("1.0917");
  expect(peakPriceText(TOPO_PEAKS[2], 157.318)).toBe("157.32");
});

// ── flicker, telemetry, status ──────────────────────────────────────────────

test("the whole-frame flicker stays within the web's alpha band", () => {
  for (let i = 0; i < 600; i++) {
    const alpha = topoFlicker(i / 40);

    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(1);
  }
});

test("the flicker occasionally drops the frame to a dim dropout", () => {
  const samples = Array.from({ length: 4000 }, (_, i) => {
    return topoFlicker(i / 20);
  });

  expect(Math.min(...samples)).toBeLessThan(0.6);
});

test("telemetry uses the substituted bullet, never the web's fisheye", () => {
  const telemetry = topoTelemetry(0.5, 0);

  expect(telemetry.title).not.toContain("◉");
  expect(telemetry.title).toContain("●");
  expect(telemetry.title).toContain("VOL SURFACE");
});

// U+03C3 σ is covered by both bundled JetBrains Mono faces, so unlike the
// fisheye it is transcribed rather than substituted.
test("the grid legend keeps the web's sigma glyph", () => {
  expect(topoTelemetry(0.5, 0).grid).toBe("GRID RZ_5.19.24 · σ ALTITUDE");
});

test("the feed flips from SYNC to LIVE at the halfway mark", () => {
  expect(topoTelemetry(0.4, 0).peaks).toBe("PEAKS 6 · FEED SYNC");
  expect(topoTelemetry(0.6, 0).peaks).toBe("PEAKS 6 · FEED LIVE");
});

test("the timestamp zero-pads every field", () => {
  expect(topoTimestamp(2026, 7, 4, 9, 5, 3)).toBe("2026-07-04 09:05:03");
});

test("the status ladder walks its three states in order", () => {
  expect(topoStatus(0.2).text).toBe("SCANNING VOLATILITY TERRAIN");
  expect(topoStatus(0.5).text).toBe("RESOLVING SUMMITS");
  expect(topoStatus(0.8).text).toBe("PRICE FEED LIVE ▸ HANDOFF");
});

test("only the final status switches to the alt accent", () => {
  expect(topoStatus(0.2).useAltAccent).toBe(false);
  expect(topoStatus(0.8).useAltAccent).toBe(true);
});

test("the banner blinks only while scanning, then holds solid", () => {
  expect(topoBlinkAlpha(0.5, 0.3)).toBe(1);

  const blinking = Array.from({ length: 60 }, (_, i) => {
    return topoBlinkAlpha(0.2, i / 10);
  });

  expect(Math.min(...blinking)).toBeLessThan(0.99);
  expect(Math.min(...blinking)).toBeGreaterThanOrEqual(0.55);
});
