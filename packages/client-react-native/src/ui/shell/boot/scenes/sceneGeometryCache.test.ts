import { expect, test, vi } from "vitest";

import { cachedSceneGeometry } from "./sceneGeometryCache";

test("the same key returns the identical object across calls", () => {
  const compute = vi.fn(() => {
    return { built: true };
  });

  const first = cachedSceneGeometry("test:same-key", [390, 844], compute);
  const second = cachedSceneGeometry("test:same-key", [390, 844], compute);

  expect(second).toBe(first);
  expect(compute).toHaveBeenCalledTimes(1);
});

test("a different key computes and caches a different object", () => {
  const compute = vi.fn(() => {
    return { width: compute.mock.calls.length };
  });

  const at390 = cachedSceneGeometry("test:different-key", [390], compute);
  const at428 = cachedSceneGeometry("test:different-key", [428], compute);

  expect(at428).not.toBe(at390);
  expect(compute).toHaveBeenCalledTimes(2);
});

test("distinct cache names never collide even with identical key parts", () => {
  const computeA = vi.fn(() => {
    return { owner: "a" };
  });

  const computeB = vi.fn(() => {
    return { owner: "b" };
  });

  const fromA = cachedSceneGeometry("test:namespace-a", [1, 2], computeA);
  const fromB = cachedSceneGeometry("test:namespace-b", [1, 2], computeB);

  expect(fromA).not.toBe(fromB);
  expect(computeA).toHaveBeenCalledTimes(1);
  expect(computeB).toHaveBeenCalledTimes(1);
});

test("the bound actually evicts — a 5th distinct key drops the oldest entry", () => {
  const cacheName = "test:eviction";
  const compute = vi.fn((n: number) => {
    return (): EvictionEntry => {
      return { n };
    };
  });

  // Fill the cache to its bound (4 entries: keys 0..3).
  const first = cachedSceneGeometry(cacheName, [0], compute(0));

  cachedSceneGeometry(cacheName, [1], compute(1));
  cachedSceneGeometry(cacheName, [2], compute(2));
  cachedSceneGeometry(cacheName, [3], compute(3));

  // A 5th distinct key evicts the oldest (key 0) rather than growing
  // unbounded.
  cachedSceneGeometry(cacheName, [4], compute(4));

  const refetchFirst = cachedSceneGeometry(cacheName, [0], compute(0));

  expect(refetchFirst).not.toBe(first);
});

interface EvictionEntry {
  readonly n: number;
}
