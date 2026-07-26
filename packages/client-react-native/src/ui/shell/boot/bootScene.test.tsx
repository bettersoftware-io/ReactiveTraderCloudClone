import { expect, test } from "@jest/globals";

import { BOOT_VARIANTS, type BootVariant } from "@rtc/domain";

import { BOOT_SCENES, hasBootScene } from "#/ui/shell/boot/bootScene";

// Jest, not vitest, from Task 6 on: `bootScene.ts` now holds a real value
// import of `CoreScene` (not just the `BootSceneComponent` type), which
// transitively pulls in `@shopify/react-native-skia` and
// `react-native-reanimated` → real `react-native` (Flow syntax) — parseable
// under jest's RN babel transform, not under vitest's plain node/esbuild
// pipeline. `coreGeometry.test.ts` still covers the framework-free math
// under vitest.

test("reports coverage for a variant without throwing", () => {
  expect(() => {
    return hasBootScene("topo");
  }).not.toThrow();
  expect(hasBootScene("topo")).toBe(true);
});

// The registry is total in practice but still `Partial` in type, so the
// "no scene registered" fallback stays reachable and tested. A non-variant key
// is the only way to reach it now that every real variant resolves.
test("an unknown variant key still resolves to nothing, without throwing", () => {
  const unknown = "not-a-variant" as BootVariant;

  expect(hasBootScene(unknown)).toBe(false);
  expect(BOOT_SCENES[unknown]).toBeUndefined();
});

test("reports coverage for the core variant now that Task 6 registers it", () => {
  expect(hasBootScene("core")).toBe(true);
  expect(BOOT_SCENES.core).toBeDefined();
});

test("reports coverage for the laser variant now that Task 7 registers it", () => {
  expect(hasBootScene("laser")).toBe(true);
  expect(BOOT_SCENES.laser).toBeDefined();
});

test("docking resolves to a scene now that phase 6b-1 has ported it", () => {
  expect(hasBootScene("docking")).toBe(true);
  expect(BOOT_SCENES.docking).toBeDefined();
});

test("hologram resolves to a scene now that phase 6b-2a has ported it", () => {
  expect(hasBootScene("hologram")).toBe(true);
  expect(BOOT_SCENES.hologram).toBeDefined();
});

test("layers resolves to a scene now that phase 6b-2a has ported it", () => {
  expect(hasBootScene("layers")).toBe(true);
  expect(BOOT_SCENES.layers).toBeDefined();
});

test("geo resolves to a scene now that phase 6b-2b has started", () => {
  expect(hasBootScene("geo")).toBe(true);
  expect(BOOT_SCENES.geo).toBeDefined();
});

test("jarvis resolves to a scene now that phase 6b-2b has ported it", () => {
  expect(hasBootScene("jarvis")).toBe(true);
  expect(BOOT_SCENES.jarvis).toBeDefined();
});

test("topo resolves to a scene, completing the set", () => {
  expect(hasBootScene("topo")).toBe(true);
  expect(BOOT_SCENES.topo).toBeDefined();
});

// Phase 6b is complete: all eight variants the preference can select now
// resolve to a real scene.
test("every boot variant now resolves to a scene", () => {
  for (const variant of BOOT_VARIANTS) {
    expect(hasBootScene(variant)).toBe(true);
    expect(BOOT_SCENES[variant]).toBeDefined();
  }
});

test("every registered key is a real boot variant (guards a typo'd key)", () => {
  const registeredKeys = Object.keys(BOOT_SCENES);

  for (const key of registeredKeys) {
    expect(BOOT_VARIANTS).toContain(key);
  }
});
