import { expect, test } from "vitest";

import {
  bannerBlinkAlpha,
  bootProgress,
  CORE_HUBS,
  clamp01,
  coreBootStatus,
  ease,
  globePitch,
  globeYaw,
  hexToRgba,
  hubVectorFromLatLon,
  MERIDIAN_COUNT,
  meridianLatitudes,
  meridianLongitude,
  meridianRevealPhase,
  nodeAlpha,
  nodeRevealPhase,
  parallelLatitude,
  parallelLongitudes,
  parallelRevealPhase,
  pingRingAlpha,
  pingRingFraction,
  pingRingRadius,
  projectGlobePoint,
  segmentAlpha,
} from "./coreGeometry.js";

test("clamp01 clamps below 0 and above 1", () => {
  expect(clamp01(-0.5)).toBe(0);
  expect(clamp01(1.5)).toBe(1);
  expect(clamp01(0.3)).toBeCloseTo(0.3);
});

test("ease is 0 at t=0 and 1 at t=1", () => {
  expect(ease(0)).toBeCloseTo(0);
  expect(ease(1)).toBeCloseTo(1);
});

test("hexToRgba expands a 3-digit hex and applies alpha", () => {
  expect(hexToRgba("#f00", 0.5)).toBe("rgba(255,0,0,0.5)");
});

test("hexToRgba parses a 6-digit hex verbatim", () => {
  expect(hexToRgba("#3b82f6", 0.2)).toBe("rgba(59,130,246,0.2)");
});

test("segmentAlpha is higher for near depth (small z) than far depth", () => {
  expect(segmentAlpha(-1)).toBeGreaterThan(segmentAlpha(1));
});

test("hubVectorFromLatLon returns a unit vector for the equator/prime-meridian hub", () => {
  const [x, y, z] = hubVectorFromLatLon(0, 0);
  expect(x).toBeCloseTo(1);
  expect(y).toBeCloseTo(0);
  expect(z).toBeCloseTo(0);
});

test("hubVectorFromLatLon at the north pole collapses x/z to 0 and y to 1", () => {
  const [x, y, z] = hubVectorFromLatLon(Math.PI / 2, 1.3);
  expect(x).toBeCloseTo(0);
  expect(y).toBeCloseTo(1);
  expect(z).toBeCloseTo(0);
});

test("CORE_HUBS has ten hubs with distinct, stable ping phases", () => {
  expect(CORE_HUBS).toHaveLength(10);
  const phases = new Set(
    CORE_HUBS.map((hub) => {
      return hub.phase;
    }),
  );
  expect(phases.size).toBe(10);
  const codes = CORE_HUBS.map((hub) => {
    return hub.code;
  });
  expect(codes).toContain("LON");
  expect(codes).toContain("SYD");
});

test("globeYaw folds a positive drift.mx forward and stays within the documented cap", () => {
  const base = globeYaw(0, 0);
  const drifted = globeYaw(0, 1);
  expect(drifted - base).toBeLessThanOrEqual(0.15);
  expect(drifted).toBeGreaterThan(base);
});

test("globePitch folds drift.my around the fixed tilt within the documented cap", () => {
  const base = globePitch(0);
  const drifted = globePitch(1);
  expect(Math.abs(drifted - base)).toBeLessThanOrEqual(0.15);
});

test("projectGlobePoint is Y-up: a hub at the north pole projects above centre (smaller screen y)", () => {
  const params = { yaw: 0, pitch: 0, perspectiveK: 0.28 };
  const north = projectGlobePoint(Math.PI / 2, 0, params, 100, 100, 40);
  const south = projectGlobePoint(-Math.PI / 2, 0, params, 100, 100, 40);
  expect(north.y).toBeLessThan(south.y);
});

test("projectGlobePoint centres a point with no rotation and zero radius contribution at the pole", () => {
  const params = { yaw: 0, pitch: 0, perspectiveK: 0 };
  const point = projectGlobePoint(0, 0, params, 50, 50, 20);
  // (1,0,0) unit vector, no rotation, no perspective: screen x = center + radius
  expect(point.x).toBeCloseTo(70);
  expect(point.y).toBeCloseTo(50);
});

test("meridianLongitude spaces meridians evenly around the globe", () => {
  expect(meridianLongitude(0, MERIDIAN_COUNT)).toBeCloseTo(0);
  expect(meridianLongitude(MERIDIAN_COUNT / 2, MERIDIAN_COUNT)).toBeCloseTo(
    Math.PI,
  );
});

test("meridianRevealPhase staggers later meridians behind earlier ones", () => {
  expect(meridianRevealPhase(1, MERIDIAN_COUNT, 0)).toBe(1);
  expect(meridianRevealPhase(0, MERIDIAN_COUNT, 0)).toBe(0);
  expect(meridianRevealPhase(0.5, MERIDIAN_COUNT, 11)).toBe(0);
});

test("meridianLatitudes at phase 0 yields only the south pole sample", () => {
  const lats = meridianLatitudes(0);
  expect(lats).toEqual([-Math.PI / 2]);
});

test("meridianLatitudes at phase 1 spans pole-to-pole", () => {
  const lats = meridianLatitudes(1);
  expect(lats[0]).toBeCloseTo(-Math.PI / 2);
  expect(lats[lats.length - 1]).toBeCloseTo(Math.PI / 2);
});

test("meridianLatitudes grows monotonically with phase", () => {
  const short = meridianLatitudes(0.25);
  const long = meridianLatitudes(0.75);
  expect(long.length).toBeGreaterThan(short.length);
});

test("parallelLatitude(0) is the equator", () => {
  expect(parallelLatitude(0)).toBe(0);
});

test("parallelLatitude is symmetric about the equator", () => {
  expect(parallelLatitude(2)).toBeCloseTo(-parallelLatitude(-2));
});

test("parallelRevealPhase(reveal=1) fully reveals every ring in range", () => {
  for (const idx of [-2, -1, 0, 1, 2]) {
    expect(parallelRevealPhase(1, idx)).toBe(1);
  }
});

test("parallelLongitudes at phase 0 yields a single sample", () => {
  expect(parallelLongitudes(0)).toEqual([0]);
});

test("parallelLongitudes at phase 1 wraps a full circle", () => {
  const lons = parallelLongitudes(1);
  expect(lons[lons.length - 1]).toBeCloseTo(Math.PI * 2);
});

test("nodeRevealPhase staggers hubs by index the same way meridians stagger", () => {
  expect(nodeRevealPhase(1, 0, 10)).toBe(1);
  expect(nodeRevealPhase(0, 5, 10)).toBe(0);
});

test("nodeAlpha is fully faded out at nodePhase 0 and non-zero once revealed", () => {
  expect(nodeAlpha(0, 0)).toBe(0);
  expect(nodeAlpha(1, -1)).toBeGreaterThan(0);
});

test("pingRingFraction wraps every 1/0.8 seconds and loops back to the hub's phase offset", () => {
  expect(pingRingFraction(0, 0.25)).toBeCloseTo(0.25);
  const wrapped = pingRingFraction(1.25, 0);
  expect(wrapped).toBeGreaterThanOrEqual(0);
  expect(wrapped).toBeLessThan(1);
});

test("pingRingRadius grows with ring fraction and scales with perspective", () => {
  expect(pingRingRadius(1, 0)).toBeCloseTo(2);
  expect(pingRingRadius(1, 1)).toBeCloseTo(12);
  expect(pingRingRadius(2, 0)).toBeCloseTo(4);
});

test("pingRingAlpha fades to 0 as the ripple completes", () => {
  expect(pingRingAlpha(0, 1)).toBeCloseTo(0.5);
  expect(pingRingAlpha(1, 1)).toBeCloseTo(0);
});

test("bootProgress clamps at 1 once elapsed time passes the boot duration", () => {
  expect(bootProgress(0, 4200)).toBe(0);
  expect(bootProgress(2.1, 4200)).toBeCloseTo(0.5);
  expect(bootProgress(10, 4200)).toBe(1);
});

test("coreBootStatus steps through the three narrated phases", () => {
  expect(coreBootStatus(0).text).toBe("SPINNING UP CORE");
  expect(coreBootStatus(0.5).text).toBe("LINKING GLOBAL NODES");
  expect(coreBootStatus(0.9)).toEqual({
    text: "MESH ONLINE ▸ HANDOFF",
    useAltColor: true,
  });
});

test("bannerBlinkAlpha holds steady at 1 once linking begins", () => {
  expect(bannerBlinkAlpha(0.32, 0)).toBe(1);
  expect(bannerBlinkAlpha(0.9, 3)).toBe(1);
});

test("bannerBlinkAlpha oscillates within [0.1, 1] while spinning up", () => {
  for (let t = 0; t < 2; t += 0.1) {
    const alpha = bannerBlinkAlpha(0, t);
    expect(alpha).toBeGreaterThanOrEqual(0.1);
    expect(alpha).toBeLessThanOrEqual(1);
  }
});
