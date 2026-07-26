import { expect, test } from "vitest";

import {
  activeGeoTrades,
  cityBarHeight,
  cityBarPhase,
  cityIsHot,
  cityLabelPhase,
  cityVolumeLabel,
  GEO_PERSPECTIVE_K,
  GEO_PITCH,
  GEO_TABLE_RINGS,
  geoBlinkAlpha,
  geoCityNodes,
  geoCoastlinePhase,
  geoFlicker,
  geoGraticuleChords,
  geoGraticulePhase,
  geoLonLatToPlane,
  geoNearness,
  geoPlanePolys,
  geoPointInside,
  geoStatus,
  geoSweepX,
  geoTelemetry,
  geoTerrainDots,
  geoTerrainPhase,
  geoTotalTracePoints,
  geoTracedPointCount,
  geoYaw,
  spawnedTradeCount,
  TRADE_MAX_CONCURRENT,
  TRADE_SPAWN_INTERVAL_SEC,
  tradeArcLift,
  tradeArcPoint,
} from "./geoGeometry";

const POLYS = geoPlanePolys();
const CITIES = geoCityNodes();

// ── plane mapping ───────────────────────────────────────────────────────────

test("lon/lat maps to plane space exactly as the web does", () => {
  expect(geoLonLatToPlane([4, 48])).toStrictEqual({ x: 0, z: 0 });
  expect(geoLonLatToPlane([14, 48]).x).toBeCloseTo(10 * 0.068);
  // Latitude is INVERTED: further north is a smaller z.
  expect(geoLonLatToPlane([4, 58]).z).toBeCloseTo(-1);
});

test("the seven coastlines survive the mapping with their point counts", () => {
  expect(POLYS).toHaveLength(7);
  expect(
    POLYS.reduce((sum, poly) => {
      return sum + poly.points.length;
    }, 0),
  ).toBe(270);
});

// ── point-in-polygon, terrain, graticule ────────────────────────────────────

test("the point-in-polygon test separates land from sea", () => {
  // Paris is on the continent; a point far out in the Atlantic is not.
  const paris = geoLonLatToPlane([2.35, 48.86]);

  expect(geoPointInside(POLYS, paris.x, paris.z)).toBe(true);
  expect(geoPointInside(POLYS, -0.95, -1.1)).toBe(false);
});

test("the terrain mesh is deterministic and lands only on land", () => {
  const dots = geoTerrainDots(POLYS);

  expect(dots.length).toBeGreaterThan(100);

  for (const dot of dots) {
    expect(geoPointInside(POLYS, dot.x, dot.z)).toBe(true);
    expect(dot.height).toBeGreaterThanOrEqual(0.015);
  }
});

// The Alps ridge is the tallest feature; if the gaussians were transposed the
// mesh would still look plausible but the highest point would move.
test("the tallest terrain sits on the Alps ridge, not elsewhere", () => {
  const dots = geoTerrainDots(POLYS);
  let tallest = dots[0];

  for (const dot of dots) {
    if (dot.height > tallest.height) {
      tallest = dot;
    }
  }

  expect(tallest.x).toBeGreaterThan(0.2);
  expect(tallest.x).toBeLessThan(0.6);
  expect(tallest.z).toBeGreaterThan(0);
  expect(tallest.z).toBeLessThan(0.35);
});

test("graticule chords are clipped to the landmass and never single points", () => {
  const chords = geoGraticuleChords(POLYS);

  expect(chords.length).toBeGreaterThan(0);

  for (const chord of chords) {
    expect(chord.points.length).toBeGreaterThan(1);

    for (const point of chord.points) {
      expect(geoPointInside(POLYS, point.x, point.z)).toBe(true);
    }
  }
});

// ── camera ──────────────────────────────────────────────────────────────────

// `bootGeo.ts:528` is `1 / (1 + depth * 0.22)` — no clamp, like `hologram` and
// unlike `layers`/`jarvis`/`topo`.
test("geo projects with its own k and NO near-plane clamp", () => {
  expect(GEO_PERSPECTIVE_K).toBe(0.22);
  expect(GEO_PITCH).toBeCloseTo(0.52);
});

test("the camera yaw drifts continuously from its 0.35 rad offset", () => {
  expect(geoYaw(0)).toBeCloseTo(0.35);
  expect(geoYaw(2)).toBeCloseTo(0.35 + 2 * 0.28);
});

test("nearness falls off with depth", () => {
  expect(geoNearness(-1)).toBeGreaterThan(geoNearness(1));
  expect(geoNearness(5)).toBe(0);
});

// ── schedules ───────────────────────────────────────────────────────────────

test("the boot phases start in the web's order", () => {
  expect(geoCoastlinePhase(0.01)).toBeGreaterThan(0);
  expect(geoGraticulePhase(0.06)).toBe(0);
  expect(geoTerrainPhase(0.16)).toBe(0);
  expect(geoTerrainPhase(0.5)).toBeGreaterThan(0);
});

test("coastlines trace in on a shared budget, poly by poly", () => {
  const total = geoTotalTracePoints(POLYS);

  // Each poly costs its length plus the closing point.
  expect(total).toBe(270 + POLYS.length);
  // A poly can never draw more than it has, however much budget remains.
  expect(geoTracedPointCount(10, 999)).toBe(11);
  expect(geoTracedPointCount(10, 4)).toBe(4);
});

test("the radar sweep crosses the plane and wraps", () => {
  expect(geoSweepX(0)).toBeCloseTo(-1);
  expect(geoSweepX(1 / 0.32)).toBeCloseTo(-1);
  expect(geoSweepX(0.5 / 0.32)).toBeCloseTo(0);
});

// ── flicker ─────────────────────────────────────────────────────────────────

test("the whole-frame flicker stays within the web's alpha band", () => {
  for (let i = 0; i < 600; i++) {
    const alpha = geoFlicker(i / 40);

    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(1);
  }
});

test("the flicker occasionally drops the frame to a dim dropout", () => {
  const samples = Array.from({ length: 4000 }, (_, i) => {
    return geoFlicker(i / 20);
  });

  expect(Math.min(...samples)).toBeLessThan(0.6);
});

test("the table rings keep the web's radii and only two are dashed", () => {
  expect(
    GEO_TABLE_RINGS.map((ring) => {
      return ring.radius;
    }),
  ).toStrictEqual([1.6, 1.72, 0.42]);
  expect(GEO_TABLE_RINGS[0].dash).toBeUndefined();
  expect(GEO_TABLE_RINGS[1].dash).toStrictEqual([3, 7]);
  expect(Math.sign(GEO_TABLE_RINGS[1].rotationRate ?? 0)).not.toBe(
    Math.sign(GEO_TABLE_RINGS[2].rotationRate ?? 0),
  );
});

// ── trades: the stateless reconstruction ────────────────────────────────────

test("no trade flies before the boot is half done", () => {
  expect(spawnedTradeCount(0)).toBe(0);
  expect(activeGeoTrades(1)).toHaveLength(0);
});

test("trades spawn on a fixed interval once the window opens", () => {
  const first = 4.2 * 0.5;

  expect(spawnedTradeCount(first + 0.01)).toBe(1);
  expect(spawnedTradeCount(first + TRADE_SPAWN_INTERVAL_SEC + 0.01)).toBe(2);
});

test("a trade always flies between two DIFFERENT cities", () => {
  for (let step = 0; step < 400; step++) {
    for (const trade of activeGeoTrades(2 + step / 20)) {
      expect(trade.fromIndex).not.toBe(trade.toIndex);
      expect(trade.fromIndex).toBeGreaterThanOrEqual(0);
      expect(trade.fromIndex).toBeLessThan(CITIES.length);
      expect(trade.toIndex).toBeLessThan(CITIES.length);
    }
  }
});

test("a trade's flight fraction always runs inside [0, 1)", () => {
  for (let step = 0; step < 400; step++) {
    for (const trade of activeGeoTrades(2 + step / 20)) {
      expect(trade.flightFrac).toBeGreaterThanOrEqual(0);
      expect(trade.flightFrac).toBeLessThan(1);
    }
  }
});

// The web caps concurrent trades at 9, but the cap can never bind: the longest
// flight is 2.4s against a 0.34s spawn interval, so at most 8 overlap. That is
// what makes the stateless reconstruction EXACT rather than an approximation —
// if the cap could bind, replaying from time alone would diverge from the web's
// accumulated array.
test("the web's concurrent-trade cap never binds, so time alone is enough", () => {
  let busiest = 0;

  for (let step = 0; step < 2000; step++) {
    busiest = Math.max(busiest, activeGeoTrades(2 + step / 40).length);
  }

  expect(busiest).toBeGreaterThan(0);
  expect(busiest).toBeLessThan(TRADE_MAX_CONCURRENT);
});

test("trades are deterministic — the same instant replays identically", () => {
  expect(activeGeoTrades(3.7)).toStrictEqual(activeGeoTrades(3.7));
});

test("an arc lifts off the plane and lands back on it", () => {
  const lift = tradeArcLift(CITIES[0], CITIES[3]);
  const start = tradeArcPoint(CITIES[0], CITIES[3], lift, 0);
  const middle = tradeArcPoint(CITIES[0], CITIES[3], lift, 0.5);
  const end = tradeArcPoint(CITIES[0], CITIES[3], lift, 1);

  expect(start.y).toBeCloseTo(0.55);
  expect(end.y).toBeCloseTo(0.55);
  // Negative y is UP in this projection, so the apex is BELOW the plane value.
  expect(middle.y).toBeLessThan(start.y);
  expect(start.x).toBeCloseTo(CITIES[0].x);
  expect(end.x).toBeCloseTo(CITIES[3].x);
});

test("longer routes arc higher", () => {
  const near = tradeArcLift(CITIES[0], CITIES[1]);
  const far = tradeArcLift(CITIES[0], CITIES[9]);

  expect(far).toBeGreaterThan(near);
});

// ── city bars ───────────────────────────────────────────────────────────────

test("city bars grow staggered by draw order, not all at once", () => {
  expect(cityBarPhase(0, 0.45)).toBeGreaterThan(cityBarPhase(11, 0.45));
});

test("more important capitals raise taller bars", () => {
  const london = CITIES[0];
  const lisbon = CITIES[9];

  expect(cityBarHeight(london, 1, 0)).toBeGreaterThan(
    cityBarHeight(lisbon, 1, 0),
  );
});

test("only the major capitals are hot enough to earn a label", () => {
  const hot = CITIES.filter(cityIsHot);

  expect(hot.length).toBeGreaterThan(0);
  expect(hot.length).toBeLessThan(CITIES.length);
  expect(
    hot.map((city) => {
      return city.label;
    }),
  ).toContain("LONDON");
});

test("labels fade in only in the second half of the boot", () => {
  expect(cityLabelPhase(0.55)).toBe(0);
  expect(cityLabelPhase(0.7)).toBe(1);
});

test("the volume readout stays a whole number of millions", () => {
  expect(cityVolumeLabel(CITIES[0], 1.2)).toMatch(/^VOL \d+M$/);
});

// ── telemetry, status ───────────────────────────────────────────────────────

test("telemetry uses the substituted bullet, never the web's fisheye", () => {
  const telemetry = geoTelemetry(500, 0, 3, 2);

  expect(telemetry.title).not.toContain("◉");
  expect(telemetry.title).toContain("●");
  expect(telemetry.title).toContain("GEO-FEED");
});

test("telemetry reports the mesh size, yaw and route counts", () => {
  const telemetry = geoTelemetry(842, 0, 7, 3);

  expect(telemetry.mesh).toBe("NODES 12 · MESH 842 pts");
  expect(telemetry.yaw).toBe("YAW 0.0°");
  expect(telemetry.routes).toBe("ROUTES 7 · LIVE 3");
});

test("the status ladder walks its four states in order", () => {
  expect(geoStatus(0.1).text).toBe("TRACING COASTLINE");
  expect(geoStatus(0.4).text).toBe("RENDERING TERRAIN MESH");
  expect(geoStatus(0.7).text).toBe("NODES ONLINE ▸ ROUTING ORDER FLOW");
  expect(geoStatus(0.9).text).toBe("GEO GRID STABLE");
});

// Like `layers`, the final state takes the POSITIVE accent — a third colour.
test("the status tone reaches a third colour at launch", () => {
  expect(geoStatus(0.1).tone).toBe("accent");
  expect(geoStatus(0.7).tone).toBe("accentAlt");
  expect(geoStatus(0.9).tone).toBe("positive");
});

test("the banner blinks until the grid is stable, then holds solid", () => {
  expect(geoBlinkAlpha(0.9, 0.3)).toBe(1);

  const blinking = Array.from({ length: 60 }, (_, i) => {
    return geoBlinkAlpha(0.3, i / 10);
  });

  expect(Math.min(...blinking)).toBeLessThan(0.99);
  expect(Math.min(...blinking)).toBeGreaterThanOrEqual(0.55);
});
