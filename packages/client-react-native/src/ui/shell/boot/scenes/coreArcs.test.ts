import { expect, test } from "vitest";

import {
  ARC_FIRST_SEC,
  ARC_INTERVAL_SEC,
  activeFlowArcs,
  arcBulgeVector,
  spawnedArcCount,
  spotlightFlowRate,
  spotlightIndex,
} from "./coreArcs.js";
import { CORE_HUBS, hubVectorFromLatLon } from "./coreGeometry.js";

test("no arcs before the 36%-of-boot gate", () => {
  expect(activeFlowArcs(0)).toHaveLength(0);
  expect(activeFlowArcs(ARC_FIRST_SEC - 0.01)).toHaveLength(0);
  expect(spawnedArcCount(1)).toBe(0);
});

test("the first arc is live immediately after the gate", () => {
  const arcs = activeFlowArcs(ARC_FIRST_SEC + 0.01);
  expect(arcs).toHaveLength(1);
  expect(arcs[0].progress).toBeGreaterThan(0);
  expect(arcs[0].progress).toBeLessThan(0.05);
});

test("arcs spawn every half second and retire when their progress passes 1", () => {
  const at = ARC_FIRST_SEC + ARC_INTERVAL_SEC * 4 + 0.01;
  expect(spawnedArcCount(at)).toBe(5);
  const live = activeFlowArcs(at);
  expect(live.length).toBeGreaterThan(0);
  // Not a strict "<5": with this instant's actual hashRandom draws, arcs 0
  // and 1 both land ~2.25s durations, which genuinely outlive the 2.0s
  // window since arc 0 spawned, so all 5 spawned-so-far arcs are still live
  // here. The real "at most 5, cap of 6 unreachable" invariant is asserted
  // properly (2000-sample sweep) by the "live arcs never exceed 5" test below.
  expect(live.length).toBeLessThanOrEqual(5);

  for (const arc of live) {
    expect(arc.progress).toBeGreaterThanOrEqual(0);
    expect(arc.progress).toBeLessThan(1);
  }
});

test("live arcs never exceed 5, so the web's cap of 6 is unreachable", () => {
  let peak = 0;

  for (let i = 0; i < 2000; i++) {
    peak = Math.max(peak, activeFlowArcs(i / 100).length);
  }

  expect(peak).toBeLessThanOrEqual(5);
});

test("an arc never links a hub to itself", () => {
  for (let n = 0; n < 200; n++) {
    const at = ARC_FIRST_SEC + n * ARC_INTERVAL_SEC + 0.01;

    for (const arc of activeFlowArcs(at)) {
      expect(arc.fromHub).not.toBe(arc.toHub);
      expect(arc.fromHub).toBeGreaterThanOrEqual(0);
      expect(arc.fromHub).toBeLessThan(CORE_HUBS.length);
      expect(arc.toHub).toBeLessThan(CORE_HUBS.length);
    }
  }
});

test("the schedule is pure — the same instant yields the same arcs", () => {
  expect(activeFlowArcs(3.7)).toEqual(activeFlowArcs(3.7));
});

test("both buy and sell arcs occur", () => {
  const kinds = new Set<boolean>();

  for (let i = 0; i < 600; i++) {
    for (const arc of activeFlowArcs(i / 20)) {
      kinds.add(arc.buy);
    }
  }

  expect(kinds.size).toBe(2);
});

test("an arc's midpoint bows off the sphere by the 0.28 bulge", () => {
  const from = hubVectorFromLatLon(CORE_HUBS[0].lat, CORE_HUBS[0].lon);
  const to = hubVectorFromLatLon(CORE_HUBS[1].lat, CORE_HUBS[1].lon);
  const mid = arcBulgeVector(0.5, from, to);
  expect(Math.hypot(mid[0], mid[1], mid[2])).toBeCloseTo(1.28);
  const start = arcBulgeVector(0, from, to);
  expect(Math.hypot(start[0], start[1], start[2])).toBeCloseTo(1);
});

test("the spotlight steps to the next hub every 2.2s and wraps", () => {
  expect(spotlightIndex(0, 10)).toBe(0);
  expect(spotlightIndex(2.3, 10)).toBe(1);
  expect(spotlightIndex(22.1, 10)).toBe(0);
});

test("the spotlight flow rate stays in the web's 120..300 M/s band", () => {
  for (let i = 0; i < 400; i++) {
    const rate = spotlightFlowRate(i / 10, 1.7);
    expect(rate).toBeGreaterThanOrEqual(120);
    expect(rate).toBeLessThanOrEqual(300);
  }
});
